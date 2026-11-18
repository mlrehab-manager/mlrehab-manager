-- Preserve existing personal names while adding revision-aware edits and archiving.
begin;
alter table clinical_private.custom_exercises add column revision integer not null default 1 check(revision>0),add column updated_at timestamptz not null default now(),add column archived_at timestamptz;
update clinical_private.custom_exercises set updated_at=created_at;
create table clinical_private.exercise_versions(exercise_id uuid references clinical_private.custom_exercises(id),revision integer check(revision>0),payload jsonb not null,created_at timestamptz not null default now(),primary key(exercise_id,revision));
alter table clinical_private.exercise_versions enable row level security;
create policy deny_direct_clients on clinical_private.exercise_versions as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on clinical_private.exercise_versions from public,anon,authenticated;
create or replace function clinical_private.exercise_json(value clinical_private.custom_exercises) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',value.id,'clinician_id',value.clinician_id,'name',value.name,'category',value.category,'regions',value.regions,'created_at',clinical_private.backup_time(value.created_at),'revision',value.revision,'updated_at',clinical_private.backup_time(value.updated_at),'archived_at',clinical_private.backup_time(value.archived_at))
$$;
insert into clinical_private.exercise_versions select id,revision,clinical_private.exercise_json(e),created_at from clinical_private.custom_exercises e;
alter table clinical_private.audit_events drop constraint audit_events_action_check;
alter table clinical_private.audit_events add constraint audit_events_action_check check(action in (
 'patient.list','patient.read','patient.create','patient.update','patient.archive','backup.export','agenda.read','appointment.create','appointment.update','appointment.cancel','appointment.complete','session.read','session.create','session.update','exercise.list','exercise.create','exercise.update','exercise.archive'));
alter table clinical_private.audit_events drop constraint audit_entity_check;
alter table clinical_private.audit_events add constraint audit_entity_check check(coalesce(
 (action in ('patient.list','patient.read','patient.create','patient.update','patient.archive','backup.export','agenda.read','exercise.list') and entity_type is null and entity_id is null)
 or (action like 'appointment.%' and entity_type='appointment' and entity_id is not null)
 or (action like 'session.%' and entity_type='session' and entity_id is not null)
 or (action in ('exercise.create','exercise.update','exercise.archive') and entity_type='exercise' and entity_id is not null and patient_id is null and revision>=1),false));
create or replace function clinical_private.clinical_exercise_create_test(p_name text,p_category text,p_regions text[]) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.custom_exercises;zones text[];
begin
 perform pg_advisory_xact_lock(hashtextextended('exercises:'||actor::text,0));
 if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or (p_name~'[[:cntrl:]]' or p_name~U&'[\007F-\009F]') or clinical_private.exercise_name_key(p_name)='' or p_category is null or p_category not in ('isometric','dynamic','concentric','eccentric','plyometric','other') or p_regions is null or cardinality(p_regions)>8 or array_ndims(p_regions)>1 or array_position(p_regions,null) is not null or not(p_regions<@array['cervical','shoulder','elbow-forearm','wrist-hand','trunk','hip','knee','ankle-foot']::text[]) then raise exception 'Ejercicio de prueba no válido' using errcode='22023';end if;
 if (select count(*) from clinical_private.custom_exercises where clinician_id=actor)>=500 then raise exception 'Límite del catálogo de prueba' using errcode='54000';end if;
 select coalesce(array_agg(distinct x order by x),array[]::text[]) into zones from unnest(p_regions) x;
 insert into clinical_private.custom_exercises(clinician_id,name,category,regions) values(actor,btrim(p_name),p_category,zones) returning * into saved;
 insert into clinical_private.exercise_versions values(saved.id,saved.revision,clinical_private.exercise_json(saved),now());
 insert into clinical_private.audit_events(actor_id,action,revision,entity_type,entity_id) values(actor,'exercise.create',1,'exercise',saved.id);
 return clinical_private.exercise_json(saved);
end;$$;

create function clinical_private.clinical_exercise_save_test(p_id uuid,p_expected_revision integer,p_name text,p_category text,p_regions text[],p_archived boolean) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.custom_exercises;zones text[];
begin
 perform pg_advisory_xact_lock(hashtextextended('exercises:'||actor::text,0));
 if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or (p_name~'[[:cntrl:]]' or p_name~U&'[\007F-\009F]') or clinical_private.exercise_name_key(p_name)='' or p_category is null or p_category not in ('isometric','dynamic','concentric','eccentric','plyometric','other') or p_regions is null or cardinality(p_regions)>8 or array_ndims(p_regions)>1 or array_position(p_regions,null) is not null or not(p_regions<@array['cervical','shoulder','elbow-forearm','wrist-hand','trunk','hip','knee','ankle-foot']::text[]) then raise exception 'Ejercicio de prueba no válido' using errcode='22023';end if;

 if p_archived is null then raise exception 'Estado no válido' using errcode='22023';end if;
 select * into saved from clinical_private.custom_exercises where id=p_id and clinician_id=actor for update;
 if not found then raise exception 'Ejercicio no disponible' using errcode='42501';end if;
 if saved.revision is distinct from p_expected_revision or saved.archived_at is not null then raise exception 'Versión antigua o ejercicio archivado' using errcode='40001';end if;
 select coalesce(array_agg(distinct x order by x),array[]::text[]) into zones from unnest(p_regions) x;
 update clinical_private.custom_exercises set name=btrim(p_name),category=p_category,regions=zones,revision=revision+1,updated_at=now(),archived_at=case when p_archived then now() else null end where id=p_id returning * into saved;
 insert into clinical_private.exercise_versions values(saved.id,saved.revision,clinical_private.exercise_json(saved),now());
 insert into clinical_private.audit_events(actor_id,action,revision,entity_type,entity_id) values(actor,case when p_archived then 'exercise.archive' else 'exercise.update' end,saved.revision,'exercise',saved.id);
 return clinical_private.exercise_json(saved);
end;$$;
revoke all on function clinical_private.clinical_exercise_save_test(uuid,integer,text,text,text[],boolean) from public,anon;
grant execute on function clinical_private.clinical_exercise_save_test(uuid,integer,text,text,text[],boolean) to authenticated;
create function public.clinical_exercise_save_test(p_id uuid,p_expected_revision integer,p_name text,p_category text,p_regions text[],p_archived boolean) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_exercise_save_test(p_id,p_expected_revision,p_name,p_category,p_regions,p_archived)$$;
revoke all on function public.clinical_exercise_save_test(uuid,integer,text,text,text[],boolean) from public,anon;
grant execute on function public.clinical_exercise_save_test(uuid,integer,text,text,text[],boolean) to authenticated;
create or replace function clinical_private.clinical_backup_export_test() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); snapshot jsonb;
begin
  if (select count(*) from clinical_private.patients where clinician_id=actor)<>2 or exists (
    select 1 from clinical_private.patients where clinician_id=actor and
      (payload->>'fixture' is distinct from 'backup-roundtrip-v1' or payload->'testOnly' is distinct from 'true'::jsonb)
  ) then raise exception 'Solo se permite el conjunto ficticio de esta prueba' using errcode='22023'; end if;
  if (select count(*) from clinical_private.patient_versions v join clinical_private.patients p on p.id=v.patient_id where p.clinician_id=actor)>5000
    or (select count(*) from clinical_private.audit_events where actor_id=actor)>9999
    or (select coalesce(sum(octet_length(v.payload::text)),0) from clinical_private.patient_versions v join clinical_private.patients p on p.id=v.patient_id where p.clinician_id=actor)>2097152
    then raise exception 'La copia supera los límites de la prueba; no se ha recortado' using errcode='54000'; end if;
  if (select count(*) from clinical_private.appointments where clinician_id=actor)>500
    or (select count(*) from clinical_private.clinical_sessions where clinician_id=actor)>500
    or (select count(*) from clinical_private.appointment_versions v join clinical_private.appointments a on a.id=v.appointment_id where a.clinician_id=actor)>2000
    or (select count(*) from clinical_private.session_versions v join clinical_private.clinical_sessions s on s.id=v.session_id where s.clinician_id=actor)>2000
    or (select coalesce(sum(bytes),0) from (
      select octet_length(v.payload::text) as bytes from clinical_private.appointment_versions v join clinical_private.appointments a on a.id=v.appointment_id where a.clinician_id=actor
      union all select octet_length(v.payload::text) from clinical_private.session_versions v join clinical_private.clinical_sessions s on s.id=v.session_id where s.clinician_id=actor
    ) sizes)>2097152 then raise exception 'Agenda o sesiones superan el límite de copia; no se ha recortado' using errcode='54000';end if;
  if (select count(*) from clinical_private.custom_exercises where clinician_id=actor)>500 then raise exception 'Catálogo demasiado grande' using errcode='54000';end if;
  if (select count(*) from clinical_private.exercise_versions v join clinical_private.custom_exercises e on e.id=v.exercise_id where e.clinician_id=actor)>2000 then raise exception 'Historial de ejercicios demasiado grande' using errcode='54000';end if;
  insert into clinical_private.audit_events(actor_id,action) values(actor,'backup.export');
  -- One SELECT provides one MVCC read snapshot for all nine collections, including this export event.
  select jsonb_build_object(
    'format','mlrehab-clinical-test-snapshot','version',4,'test_only',true,'clinician_id',actor,
    'created_at',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'patients',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'clinician_id',p.clinician_id,'payload_json',p.payload::text,'revision',p.revision,
      'created_at',to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'updated_at',to_char(p.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'archived_at',to_char(p.archived_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by p.id),'[]'::jsonb)
      from clinical_private.patients p where p.clinician_id=actor),
    'patient_versions',(select coalesce(jsonb_agg(jsonb_build_object(
      'patient_id',v.patient_id,'revision',v.revision,'payload_json',v.payload::text,'archived',v.archived,
      'created_at',to_char(v.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by v.patient_id,v.revision),'[]'::jsonb)
      from clinical_private.patient_versions v join clinical_private.patients p on p.id=v.patient_id where p.clinician_id=actor),
    'appointments',(select coalesce(jsonb_agg(clinical_private.appointment_json(a) order by a.id),'[]'::jsonb) from clinical_private.appointments a where a.clinician_id=actor),
    'appointment_versions',(select coalesce(jsonb_agg(jsonb_build_object('appointment_id',v.appointment_id,'revision',v.revision,'payload_json',v.payload::text,'created_at',clinical_private.backup_time(v.created_at)) order by v.appointment_id,v.revision),'[]'::jsonb) from clinical_private.appointment_versions v join clinical_private.appointments a on a.id=v.appointment_id where a.clinician_id=actor),
    'sessions',(select coalesce(jsonb_agg(clinical_private.session_json(s) order by s.id),'[]'::jsonb) from clinical_private.clinical_sessions s where s.clinician_id=actor),
    'session_versions',(select coalesce(jsonb_agg(jsonb_build_object('session_id',v.session_id,'revision',v.revision,'payload_json',v.payload::text,'created_at',clinical_private.backup_time(v.created_at)) order by v.session_id,v.revision),'[]'::jsonb) from clinical_private.session_versions v join clinical_private.clinical_sessions s on s.id=v.session_id where s.clinician_id=actor),
    'exercise_versions',(select coalesce(jsonb_agg(jsonb_build_object('exercise_id',v.exercise_id,'revision',v.revision,'payload_json',v.payload::text,'created_at',clinical_private.backup_time(v.created_at)) order by v.exercise_id,v.revision),'[]'::jsonb) from clinical_private.exercise_versions v join clinical_private.custom_exercises e on e.id=v.exercise_id where e.clinician_id=actor),
    'custom_exercises',(select coalesce(jsonb_agg(clinical_private.exercise_json(e) order by e.id),'[]'::jsonb) from clinical_private.custom_exercises e where clinician_id=actor),
    'audit_events',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id::text,'entity_type',e.entity_type,'entity_id',e.entity_id,'actor_id',e.actor_id,'patient_id',e.patient_id,'action',e.action,'revision',e.revision,
      'created_at',to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by e.id),'[]'::jsonb)
      from clinical_private.audit_events e where e.actor_id=actor)
  ) into snapshot;
  if octet_length(snapshot::text)>4194304 then raise exception 'Copia demasiado grande; no se ha recortado' using errcode='54000'; end if;
  return snapshot;
end;
$$;
commit;
