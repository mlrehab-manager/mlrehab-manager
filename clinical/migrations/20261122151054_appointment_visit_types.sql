begin;
alter table clinical_private.appointments add column visit_type text not null default 'unclassified'
 check(visit_type in ('unclassified','first_visit','follow_up','gym'));
-- Unknown legacy types remain unspecified. Historical payloads are not rewritten.
create or replace function clinical_private.appointment_json(value clinical_private.appointments) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',value.id,'clinician_id',value.clinician_id,'patient_id',value.patient_id,
 'starts_at',clinical_private.backup_time(value.starts_at),'ends_at',clinical_private.backup_time(value.ends_at),
 'status',value.status,'revision',value.revision,'created_at',clinical_private.backup_time(value.created_at),'updated_at',clinical_private.backup_time(value.updated_at))
 ||case when value.visit_type='unclassified' then '{}'::jsonb else jsonb_build_object('visit_type',value.visit_type) end
$$;
create function clinical_private.clinical_appointment_save_typed(
 p_id uuid,p_expected_revision integer,p_patient_id uuid,p_start_local timestamp,p_minutes integer,p_status text,p_visit_type text
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();result jsonb;saved clinical_private.appointments;
begin
 if p_visit_type is null or p_visit_type not in ('first_visit','follow_up','gym','unclassified') then
  raise exception 'Tipo de visita no válido' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('agenda:'||actor::text,0));
 if p_visit_type='unclassified' and (p_id is null or not exists(select 1 from clinical_private.appointments where id=p_id and clinician_id=actor and visit_type='unclassified')) then
  raise exception 'Elige el tipo de visita' using errcode='22023';
 end if;
 -- Reuse current ownership/mode, revision, overlap and archived/completed protections.
 result:=clinical_private.clinical_appointment_save_test(p_id,p_expected_revision,p_patient_id,p_start_local,p_minutes,p_status);
 update clinical_private.appointments set visit_type=p_visit_type
  where id=(result->>'id')::uuid and clinician_id=actor returning * into saved;
 -- One new revision describes the entire atomic change, including type and schedule.
 update clinical_private.appointment_versions set payload=clinical_private.appointment_json(saved)
  where appointment_id=saved.id and revision=saved.revision;
 return clinical_private.appointment_json(saved);
end;$$;
revoke all on function clinical_private.clinical_appointment_save_typed(uuid,integer,uuid,timestamp,integer,text,text) from public,anon;
grant execute on function clinical_private.clinical_appointment_save_typed(uuid,integer,uuid,timestamp,integer,text,text) to authenticated;
create function public.clinical_appointment_save_typed(
 p_id uuid,p_expected_revision integer,p_patient_id uuid,p_start_local timestamp,p_minutes integer,p_status text,p_visit_type text
) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
 select clinical_private.clinical_appointment_save_typed(p_id,p_expected_revision,p_patient_id,p_start_local,p_minutes,p_status,p_visit_type)
$$;
revoke all on function public.clinical_appointment_save_typed(uuid,integer,uuid,timestamp,integer,text,text) from public,anon;
grant execute on function public.clinical_appointment_save_typed(uuid,integer,uuid,timestamp,integer,text,text) to authenticated;
commit;
