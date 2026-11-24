-- Fictitious agenda/sessions only. UTC storage, clinic timezone Europe/Madrid.
begin;
alter table clinical_private.patients add constraint patients_id_owner_unique unique(id,clinician_id);
create table clinical_private.appointments (
  id uuid primary key default gen_random_uuid(), clinician_id uuid not null, patient_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null check(status in ('scheduled','cancelled','completed')),
  revision integer not null check(revision>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(patient_id,clinician_id) references clinical_private.patients(id,clinician_id),
  unique(id,clinician_id,patient_id), check(ends_at>starts_at and ends_at<=starts_at+interval '4 hours')
);
create index appointments_owner_start on clinical_private.appointments(clinician_id,starts_at);
create table clinical_private.appointment_versions (
  appointment_id uuid references clinical_private.appointments(id), revision integer check(revision>0),
  payload jsonb not null,created_at timestamptz not null default now(),primary key(appointment_id,revision)
);
create table clinical_private.clinical_sessions (
  id uuid primary key default gen_random_uuid(),clinician_id uuid not null,patient_id uuid not null,appointment_id uuid not null unique,
  evolution text not null,passive text not null,exercise text not null,
  revision integer not null check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  foreign key(appointment_id,clinician_id,patient_id) references clinical_private.appointments(id,clinician_id,patient_id)
);
create index sessions_owner_appointment on clinical_private.clinical_sessions(clinician_id,appointment_id);
create table clinical_private.session_versions (
  session_id uuid references clinical_private.clinical_sessions(id),revision integer check(revision>0),
  payload jsonb not null,created_at timestamptz not null default now(),primary key(session_id,revision)
);
alter table clinical_private.appointments enable row level security;
alter table clinical_private.appointment_versions enable row level security;
alter table clinical_private.clinical_sessions enable row level security;
alter table clinical_private.session_versions enable row level security;
create policy deny_direct_clients on clinical_private.appointments as restrictive for all to anon,authenticated using(false) with check(false);
create policy deny_direct_clients on clinical_private.appointment_versions as restrictive for all to anon,authenticated using(false) with check(false);
create policy deny_direct_clients on clinical_private.clinical_sessions as restrictive for all to anon,authenticated using(false) with check(false);
create policy deny_direct_clients on clinical_private.session_versions as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on clinical_private.appointments,clinical_private.appointment_versions,clinical_private.clinical_sessions,clinical_private.session_versions from public,anon,authenticated;
alter table clinical_private.audit_events add column entity_type text;
alter table clinical_private.audit_events add column entity_id uuid;
alter table clinical_private.audit_events drop constraint audit_events_action_check;
alter table clinical_private.audit_events add constraint audit_events_action_check check(action in (
  'patient.list','patient.read','patient.create','patient.update','patient.archive','backup.export','agenda.read',
  'appointment.create','appointment.update','appointment.cancel','appointment.complete','session.read','session.create','session.update'
));
alter table clinical_private.audit_events add constraint audit_entity_check check(coalesce(
  (action in ('patient.list','patient.read','patient.create','patient.update','patient.archive','backup.export','agenda.read') and entity_type is null and entity_id is null)
  or (action like 'appointment.%' and entity_type='appointment' and entity_id is not null)
  or (action like 'session.%' and entity_type='session' and entity_id is not null),false));

create function clinical_private.backup_time(value timestamptz) returns text language sql stable set search_path=pg_catalog
as $$select to_char(value at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')$$;
create function clinical_private.appointment_json(value clinical_private.appointments) returns jsonb language sql stable set search_path=pg_catalog
as $$select jsonb_build_object('id',value.id,'clinician_id',value.clinician_id,'patient_id',value.patient_id,'starts_at',clinical_private.backup_time(value.starts_at),'ends_at',clinical_private.backup_time(value.ends_at),'status',value.status,'revision',value.revision,'created_at',clinical_private.backup_time(value.created_at),'updated_at',clinical_private.backup_time(value.updated_at))$$;
create function clinical_private.session_json(value clinical_private.clinical_sessions) returns jsonb language sql stable set search_path=pg_catalog
as $$select jsonb_build_object('id',value.id,'clinician_id',value.clinician_id,'patient_id',value.patient_id,'appointment_id',value.appointment_id,'evolution',value.evolution,'passive',value.passive,'exercise',value.exercise,'revision',value.revision,'created_at',clinical_private.backup_time(value.created_at),'updated_at',clinical_private.backup_time(value.updated_at))$$;
revoke all on function clinical_private.backup_time(timestamptz) from public,anon,authenticated;
revoke all on function clinical_private.appointment_json(clinical_private.appointments) from public,anon,authenticated;
revoke all on function clinical_private.session_json(clinical_private.clinical_sessions) from public,anon,authenticated;

create function clinical_private.clinic_start(value timestamp) returns timestamptz language plpgsql stable set search_path=pg_catalog as $$
declare result timestamptz;
begin
  if value is null or value<'2020-01-01'::timestamp or value>='2101-01-01'::timestamp or extract(second from value)<>0 then
    raise exception 'Hora de prueba no válida' using errcode='22023';end if;
  result:=value at time zone 'Europe/Madrid';
  if result at time zone 'Europe/Madrid'<>value or (result-interval '1 hour') at time zone 'Europe/Madrid'=value or (result+interval '1 hour') at time zone 'Europe/Madrid'=value then
    raise exception 'Hora inexistente o ambigua por cambio horario' using errcode='22023';end if;
  return result;
end;$$;
revoke all on function clinical_private.clinic_start(timestamp) from public,anon,authenticated;

create function clinical_private.clinical_agenda_list_test(p_day date) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();result jsonb;
begin
  if p_day is null or p_day<'2020-01-01'::date or p_day>'2100-12-31'::date then raise exception 'Día no válido' using errcode='22023';end if;
  select jsonb_build_object('patients',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name') order by id),'[]'::jsonb) from clinical_private.patients where clinician_id=actor and archived_at is null and payload->'testOnly'='true'::jsonb and payload->>'fixture'='backup-roundtrip-v1'),
    'appointments',(select coalesce(jsonb_agg(clinical_private.appointment_json(a)||jsonb_build_object('patient_name',p.payload->>'name','patient_archived',p.archived_at is not null,'session_id',s.id) order by a.starts_at,a.id),'[]'::jsonb)
    from clinical_private.appointments a join clinical_private.patients p on p.id=a.patient_id left join clinical_private.clinical_sessions s on s.appointment_id=a.id
    where a.clinician_id=actor and p.payload->'testOnly'='true'::jsonb and p.payload->>'fixture'='backup-roundtrip-v1' and a.starts_at<(p_day+1)::timestamp at time zone 'Europe/Madrid' and a.ends_at>p_day::timestamp at time zone 'Europe/Madrid')) into result;
  insert into clinical_private.audit_events(actor_id,action) values(actor,'agenda.read');
  return result;
end;$$;

create function clinical_private.clinical_appointment_save_test(p_id uuid,p_expected_revision integer,p_patient_id uuid,p_start_local timestamp,p_minutes integer,p_status text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.appointments;start_time timestamptz;end_time timestamptz;event text;
begin
  perform pg_advisory_xact_lock(hashtextextended('agenda:'||actor::text,0));
  start_time:=clinical_private.clinic_start(p_start_local);
  if p_minutes is null or p_minutes not between 5 and 240 or p_minutes%5<>0 or p_status is null or p_status not in ('scheduled','cancelled') then raise exception 'Cita de prueba no válida' using errcode='22023';end if;
  end_time:=start_time+make_interval(mins=>p_minutes);
  if not exists(select 1 from clinical_private.patients where id=p_patient_id and clinician_id=actor and archived_at is null and payload->'testOnly'='true'::jsonb and payload->>'fixture'='backup-roundtrip-v1') then raise exception 'Paciente no disponible' using errcode='42501';end if;
  if p_id is null then
    if p_expected_revision is not null or p_status<>'scheduled' then raise exception 'Cita nueva no válida' using errcode='22023';end if;
    event:='appointment.create';
  else
    select * into saved from clinical_private.appointments where id=p_id and clinician_id=actor for update;
    if not found or saved.revision is distinct from p_expected_revision or saved.status='completed' then raise exception 'Versión antigua o cita no disponible' using errcode='40001';end if;
    if saved.patient_id<>p_patient_id then raise exception 'No se cambia el paciente de una cita existente' using errcode='22023';end if;
    event:=case when p_status='cancelled' then 'appointment.cancel' else 'appointment.update' end;
  end if;
  if p_status='scheduled' and exists(select 1 from clinical_private.appointments where clinician_id=actor and id is distinct from p_id and status<>'cancelled' and starts_at<end_time and ends_at>start_time) then
    raise exception 'La cita se solapa con otra' using errcode='23P01';end if;
  if p_id is null then
    insert into clinical_private.appointments(clinician_id,patient_id,starts_at,ends_at,status,revision) values(actor,p_patient_id,start_time,end_time,p_status,1) returning * into saved;
  else
    update clinical_private.appointments set starts_at=start_time,ends_at=end_time,status=p_status,revision=revision+1,updated_at=now() where id=p_id returning * into saved;
  end if;
  insert into clinical_private.appointment_versions values(saved.id,saved.revision,clinical_private.appointment_json(saved),now());
  insert into clinical_private.audit_events(actor_id,patient_id,action,revision,entity_type,entity_id) values(actor,saved.patient_id,event,saved.revision,'appointment',saved.id);
  return clinical_private.appointment_json(saved);
end;$$;

create function clinical_private.clinical_session_get_test(p_appointment_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.clinical_sessions;
begin
  if not exists(select 1 from clinical_private.appointments where id=p_appointment_id and clinician_id=actor) then raise exception 'Cita no disponible' using errcode='42501';end if;
  select * into saved from clinical_private.clinical_sessions where appointment_id=p_appointment_id and clinician_id=actor;
  if not found then return null;end if;
  insert into clinical_private.audit_events(actor_id,patient_id,action,revision,entity_type,entity_id) values(actor,saved.patient_id,'session.read',saved.revision,'session',saved.id);
  return clinical_private.session_json(saved);
end;$$;

create function clinical_private.clinical_session_save_test(p_id uuid,p_expected_revision integer,p_appointment_id uuid,p_evolution text,p_passive text,p_exercise text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();appt clinical_private.appointments;saved clinical_private.clinical_sessions;event text;
begin
  perform pg_advisory_xact_lock(hashtextextended('agenda:'||actor::text,0));
  if p_evolution is null or p_passive is null or p_exercise is null or char_length(p_evolution)>8000 or char_length(p_passive)>4000 or char_length(p_exercise)>4000 then raise exception 'Texto de sesión no válido' using errcode='22023';end if;
  select * into appt from clinical_private.appointments where id=p_appointment_id and clinician_id=actor for update;
  if not found then raise exception 'Cita no disponible' using errcode='42501';end if;
  if not exists(select 1 from clinical_private.patients where id=appt.patient_id and clinician_id=actor and archived_at is null and payload->'testOnly'='true'::jsonb and payload->>'fixture'='backup-roundtrip-v1') then raise exception 'Paciente no disponible' using errcode='42501';end if;
  if p_id is null then
    if appt.status<>'scheduled' or p_expected_revision is not null or exists(select 1 from clinical_private.clinical_sessions where appointment_id=appt.id) then raise exception 'La cita ya no admite una sesión nueva' using errcode='40001';end if;
    insert into clinical_private.clinical_sessions(clinician_id,patient_id,appointment_id,evolution,passive,exercise,revision) values(actor,appt.patient_id,appt.id,p_evolution,p_passive,p_exercise,1) returning * into saved;
    update clinical_private.appointments set status='completed',revision=revision+1,updated_at=now() where id=appt.id returning * into appt;
    insert into clinical_private.appointment_versions values(appt.id,appt.revision,clinical_private.appointment_json(appt),now());
    insert into clinical_private.audit_events(actor_id,patient_id,action,revision,entity_type,entity_id) values(actor,appt.patient_id,'appointment.complete',appt.revision,'appointment',appt.id);
    event:='session.create';
  else
    select * into saved from clinical_private.clinical_sessions where id=p_id and appointment_id=appt.id and clinician_id=actor for update;
    if not found or saved.revision is distinct from p_expected_revision or appt.status<>'completed' then raise exception 'Versión antigua o sesión no disponible' using errcode='40001';end if;
    update clinical_private.clinical_sessions set evolution=p_evolution,passive=p_passive,exercise=p_exercise,revision=revision+1,updated_at=now() where id=p_id returning * into saved;
    event:='session.update';
  end if;
  insert into clinical_private.session_versions values(saved.id,saved.revision,clinical_private.session_json(saved),now());
  insert into clinical_private.audit_events(actor_id,patient_id,action,revision,entity_type,entity_id) values(actor,saved.patient_id,event,saved.revision,'session',saved.id);
  return clinical_private.session_json(saved);
end;$$;

revoke all on function clinical_private.clinical_agenda_list_test(date) from public,anon;
revoke all on function clinical_private.clinical_appointment_save_test(uuid,integer,uuid,timestamp,integer,text) from public,anon;
revoke all on function clinical_private.clinical_session_get_test(uuid) from public,anon;
revoke all on function clinical_private.clinical_session_save_test(uuid,integer,uuid,text,text,text) from public,anon;
grant execute on function clinical_private.clinical_agenda_list_test(date) to authenticated;
grant execute on function clinical_private.clinical_appointment_save_test(uuid,integer,uuid,timestamp,integer,text) to authenticated;
grant execute on function clinical_private.clinical_session_get_test(uuid) to authenticated;
grant execute on function clinical_private.clinical_session_save_test(uuid,integer,uuid,text,text,text) to authenticated;
create function public.clinical_agenda_list_test(p_day date) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_agenda_list_test(p_day)$$;
create function public.clinical_appointment_save_test(p_id uuid,p_expected_revision integer,p_patient_id uuid,p_start_local timestamp,p_minutes integer,p_status text) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_appointment_save_test(p_id,p_expected_revision,p_patient_id,p_start_local,p_minutes,p_status)$$;
create function public.clinical_session_get_test(p_appointment_id uuid) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_session_get_test(p_appointment_id)$$;
create function public.clinical_session_save_test(p_id uuid,p_expected_revision integer,p_appointment_id uuid,p_evolution text,p_passive text,p_exercise text) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_session_save_test(p_id,p_expected_revision,p_appointment_id,p_evolution,p_passive,p_exercise)$$;
revoke all on function public.clinical_agenda_list_test(date) from public,anon;
revoke all on function public.clinical_appointment_save_test(uuid,integer,uuid,timestamp,integer,text) from public,anon;
revoke all on function public.clinical_session_get_test(uuid) from public,anon;
revoke all on function public.clinical_session_save_test(uuid,integer,uuid,text,text,text) from public,anon;
grant execute on function public.clinical_agenda_list_test(date) to authenticated;
grant execute on function public.clinical_appointment_save_test(uuid,integer,uuid,timestamp,integer,text) to authenticated;
grant execute on function public.clinical_session_get_test(uuid) to authenticated;
grant execute on function public.clinical_session_save_test(uuid,integer,uuid,text,text,text) to authenticated;

-- Snapshot v2 includes the seven collections in a single SELECT.
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
  insert into clinical_private.audit_events(actor_id,action) values(actor,'backup.export');
  -- One SELECT provides one MVCC read snapshot for all seven collections, including this export event.
  select jsonb_build_object(
    'format','mlrehab-clinical-test-snapshot','version',2,'test_only',true,'clinician_id',actor,
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
