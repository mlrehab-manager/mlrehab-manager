-- One coherent weekly read; booking and session protections remain unchanged.
begin;
create function clinical_private.clinical_agenda_week(p_day date) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();monday date;result jsonb;
begin
 if p_day is null or p_day<'2020-01-01'::date or p_day>'2100-12-31'::date then
  raise exception 'Fecha no válida' using errcode='22023';
 end if;
 monday:=p_day-(extract(isodow from p_day)::integer-1);
 -- A single SELECT uses one MVCC snapshot for active patients and all appointments.
 -- Weekend/off-hours records are included for access to existing records outside the grid.
 select jsonb_build_object(
  'week_start',monday::text,'week_end',(monday+4)::text,
  'patients',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name') order by id),'[]'::jsonb)
    from clinical_private.patients where clinician_id=actor and archived_at is null and clinical_private.patient_in_mode(payload,actor)),
  'appointments',(select coalesce(jsonb_agg(clinical_private.appointment_json(a)||jsonb_build_object(
    'patient_name',p.payload->>'name','patient_archived',p.archived_at is not null,'session_id',s.id) order by a.starts_at,a.id),'[]'::jsonb)
    from clinical_private.appointments a
    join clinical_private.patients p on p.id=a.patient_id
    left join clinical_private.clinical_sessions s on s.appointment_id=a.id
    where a.clinician_id=actor and p.clinician_id=actor and clinical_private.patient_in_mode(p.payload,actor)
     and a.starts_at<((monday+7)::timestamp at time zone 'Europe/Madrid')
     and a.ends_at>(monday::timestamp at time zone 'Europe/Madrid'))
 ) into result;
 insert into clinical_private.audit_events(actor_id,action) values(actor,'agenda.read');
 return result;
end;$$;
revoke all on function clinical_private.clinical_agenda_week(date) from public,anon;
grant execute on function clinical_private.clinical_agenda_week(date) to authenticated;
create function public.clinical_agenda_week(p_day date) returns jsonb
language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_agenda_week(p_day)$$;
revoke all on function public.clinical_agenda_week(date) from public,anon;
grant execute on function public.clinical_agenda_week(date) to authenticated;
commit;
