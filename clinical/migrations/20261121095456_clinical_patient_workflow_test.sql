-- Test-only patient workflow. Names are generated with an explicit fictitious prefix.
begin;
create unique index patients_test_alias_unique on clinical_private.patients(clinician_id,clinical_private.exercise_name_key(payload->>'alias')) where payload->>'fixture'='patient-workflow-v1';
create function clinical_private.patient_alias(value text) returns text language plpgsql immutable set search_path=pg_catalog as $$
declare normalized text;
begin
 normalized:=btrim(regexp_replace(value,U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g'));
 if value is null or value~'[[:cntrl:]]' or value~U&'[\007F-\009F]' or char_length(normalized) not between 1 and 80 then raise exception 'Alias de prueba no válido' using errcode='22023';end if;
 return normalized;
end;$$;
revoke all on function clinical_private.patient_alias(text) from public,anon,authenticated;
create function clinical_private.clinical_patient_create_test(p_alias text,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();alias text:=clinical_private.patient_alias(p_alias);saved clinical_private.patients;
begin
 if p_request_id is null then raise exception 'Falta el identificador de petición' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('patient-test:'||actor::text,0));
 select * into saved from clinical_private.patients where id=p_request_id;
 if found then
   if saved.clinician_id<>actor then raise exception 'Petición no disponible' using errcode='42501';end if;
   if saved.payload->>'fixture'<>'patient-workflow-v1' or saved.payload->>'alias' is distinct from alias then raise exception 'La petición ya se utilizó para otra ficha' using errcode='40001';end if;
   return jsonb_build_object('id',saved.id,'revision',saved.revision,'already_present',true);
 end if;
 if (select count(*) from clinical_private.patients where clinician_id=actor)>=500 then raise exception 'Límite de 500 fichas de prueba' using errcode='54000';end if;
 insert into clinical_private.patients(id,clinician_id,payload) values(p_request_id,actor,jsonb_build_object('name','FICTICIO · '||alias,'alias',alias,'testOnly',true,'fixture','patient-workflow-v1','history','','exam','','diagnosis','','goals','')) returning * into saved;
 insert into clinical_private.patient_versions values(saved.id,1,saved.payload,false,now());
 insert into clinical_private.audit_events(actor_id,patient_id,action,revision) values(actor,saved.id,'patient.create',1);
 return jsonb_build_object('id',saved.id,'revision',1,'already_present',false);
end;$$;
revoke all on function clinical_private.clinical_patient_create_test(text,uuid) from public,anon;
grant execute on function clinical_private.clinical_patient_create_test(text,uuid) to authenticated;
create function public.clinical_patient_create_test(p_alias text,p_request_id uuid) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_patient_create_test(p_alias,p_request_id)$$;
revoke all on function public.clinical_patient_create_test(text,uuid) from public,anon;
grant execute on function public.clinical_patient_create_test(text,uuid) to authenticated;

create or replace function clinical_private.clinical_patient_list_test() returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();result jsonb;
begin
 if (select count(*) from clinical_private.patients where clinician_id=actor)>500 then raise exception 'Lista demasiado grande; no se ha recortado' using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name','revision',revision,'archived',archived_at is not null) order by archived_at is not null,id),'[]'::jsonb) into result from clinical_private.patients where clinician_id=actor and payload->'testOnly'='true'::jsonb and payload->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1');
 insert into clinical_private.audit_events(actor_id,action) values(actor,'patient.list');return result;
end;$$;
create or replace function clinical_private.clinical_patient_save_fields_test(p_id uuid,p_expected_revision integer,p_fields jsonb) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.patients;field text;max_length integer;patch jsonb:=p_fields;alias text;
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or p_fields='{}'::jsonb then raise exception 'Campos no válidos' using errcode='22023';end if;
 for field in select jsonb_object_keys(p_fields) loop
  if field not in ('history','exam','diagnosis','goals','alias') or jsonb_typeof(p_fields->field)<>'string' then raise exception 'Campo no editable' using errcode='22023';end if;
  max_length:=case when field in ('history','exam') then 8000 when field='alias' then 80 else 2000 end;
  if char_length(p_fields->>field)>max_length then raise exception 'Texto demasiado largo' using errcode='22023';end if;
 end loop;
 select * into saved from clinical_private.patients where id=p_id and clinician_id=actor and payload->'testOnly'='true'::jsonb and payload->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1') for update;
 if not found or saved.archived_at is not null or saved.revision is distinct from p_expected_revision then raise exception 'Versión antigua o ficha no disponible' using errcode='40001';end if;
 if p_fields ? 'alias' then
  if saved.payload->>'fixture'<>'patient-workflow-v1' then raise exception 'El nombre de las fichas iniciales se conserva' using errcode='22023';end if;
  alias:=clinical_private.patient_alias(p_fields->>'alias');patch:=patch||jsonb_build_object('alias',alias,'name','FICTICIO · '||alias);
 end if;
 return clinical_private.clinical_patient_save(p_id,p_expected_revision,saved.payload||patch);
end;$$;

-- Serialize with agenda mutations: no scheduled appointment may become unmanageable.
create or replace function clinical_private.clinical_patient_archive(p_id uuid,p_expected_revision integer) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.patients;
begin
 perform pg_advisory_xact_lock(hashtextextended('agenda:'||actor::text,0));
 select * into saved from clinical_private.patients where id=p_id and clinician_id=actor for update;
 if not found or saved.revision is distinct from p_expected_revision or saved.archived_at is not null then raise exception 'Versión antigua o ficha no disponible' using errcode='40001';end if;
 if exists(select 1 from clinical_private.appointments where patient_id=p_id and clinician_id=actor and status='scheduled') then raise exception 'Resuelve las citas programadas antes de archivar' using errcode='23514';end if;
 update clinical_private.patients set archived_at=now(),revision=revision+1,updated_at=now() where id=p_id returning * into saved;
 insert into clinical_private.patient_versions values(saved.id,saved.revision,saved.payload,true,now());
 insert into clinical_private.audit_events(actor_id,patient_id,action,revision) values(actor,saved.id,'patient.archive',saved.revision);
 return jsonb_build_object('id',saved.id,'revision',saved.revision);
end;$$;
create function clinical_private.clinical_patient_archive_test(p_id uuid,p_expected_revision integer) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();
begin
 if not exists(select 1 from clinical_private.patients where id=p_id and clinician_id=actor and payload->'testOnly'='true'::jsonb and payload->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1')) then raise exception 'Ficha no disponible' using errcode='42501';end if;
 return clinical_private.clinical_patient_archive(p_id,p_expected_revision);
end;$$;
revoke all on function clinical_private.clinical_patient_archive_test(uuid,integer) from public,anon;
grant execute on function clinical_private.clinical_patient_archive_test(uuid,integer) to authenticated;
create function public.clinical_patient_archive_test(p_id uuid,p_expected_revision integer) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_patient_archive_test(p_id,p_expected_revision)$$;
revoke all on function public.clinical_patient_archive_test(uuid,integer) from public,anon;
grant execute on function public.clinical_patient_archive_test(uuid,integer) to authenticated;
create or replace function clinical_private.clinical_agenda_list_test(p_day date) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();result jsonb;
begin
  if p_day is null or p_day<'2020-01-01'::date or p_day>'2100-12-31'::date then raise exception 'Día no válido' using errcode='22023';end if;
  select jsonb_build_object('patients',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name') order by id),'[]'::jsonb) from clinical_private.patients where clinician_id=actor and archived_at is null and payload->'testOnly'='true'::jsonb and payload->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1')),
    'appointments',(select coalesce(jsonb_agg(clinical_private.appointment_json(a)||jsonb_build_object('patient_name',p.payload->>'name','patient_archived',p.archived_at is not null,'session_id',s.id) order by a.starts_at,a.id),'[]'::jsonb)
    from clinical_private.appointments a join clinical_private.patients p on p.id=a.patient_id left join clinical_private.clinical_sessions s on s.appointment_id=a.id
    where a.clinician_id=actor and p.payload->'testOnly'='true'::jsonb and p.payload->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1') and a.starts_at<(p_day+1)::timestamp at time zone 'Europe/Madrid' and a.ends_at>p_day::timestamp at time zone 'Europe/Madrid')) into result;
  insert into clinical_private.audit_events(actor_id,action) values(actor,'agenda.read');
  return result;
end;$$;

create or replace function clinical_private.clinical_appointment_save_test(p_id uuid,p_expected_revision integer,p_patient_id uuid,p_start_local timestamp,p_minutes integer,p_status text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.appointments;start_time timestamptz;end_time timestamptz;event text;
begin
  perform pg_advisory_xact_lock(hashtextextended('agenda:'||actor::text,0));
  start_time:=clinical_private.clinic_start(p_start_local);
  if p_minutes is null or p_minutes not between 5 and 240 or p_minutes%5<>0 or p_status is null or p_status not in ('scheduled','cancelled') then raise exception 'Cita de prueba no válida' using errcode='22023';end if;
  end_time:=start_time+make_interval(mins=>p_minutes);
  if not exists(select 1 from clinical_private.patients where id=p_patient_id and clinician_id=actor and archived_at is null and payload->'testOnly'='true'::jsonb and payload->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1')) then raise exception 'Paciente no disponible' using errcode='42501';end if;
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

create or replace function clinical_private.clinical_session_get_test(p_appointment_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.clinical_sessions;
begin
  if not exists(select 1 from clinical_private.appointments where id=p_appointment_id and clinician_id=actor) then raise exception 'Cita no disponible' using errcode='42501';end if;
  select * into saved from clinical_private.clinical_sessions where appointment_id=p_appointment_id and clinician_id=actor;
  if not found then return null;end if;
  insert into clinical_private.audit_events(actor_id,patient_id,action,revision,entity_type,entity_id) values(actor,saved.patient_id,'session.read',saved.revision,'session',saved.id);
  return clinical_private.session_json(saved);
end;$$;

create or replace function clinical_private.clinical_session_save_test(p_id uuid,p_expected_revision integer,p_appointment_id uuid,p_evolution text,p_passive text,p_exercise text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();appt clinical_private.appointments;saved clinical_private.clinical_sessions;event text;
begin
  perform pg_advisory_xact_lock(hashtextextended('agenda:'||actor::text,0));
  if p_evolution is null or p_passive is null or p_exercise is null or char_length(p_evolution)>8000 or char_length(p_passive)>4000 or char_length(p_exercise)>4000 then raise exception 'Texto de sesión no válido' using errcode='22023';end if;
  select * into appt from clinical_private.appointments where id=p_appointment_id and clinician_id=actor for update;
  if not found then raise exception 'Cita no disponible' using errcode='42501';end if;
  if not exists(select 1 from clinical_private.patients where id=appt.patient_id and clinician_id=actor and archived_at is null and payload->'testOnly'='true'::jsonb and payload->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1')) then raise exception 'Paciente no disponible' using errcode='42501';end if;
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

create or replace function clinical_private.clinical_backup_seed_test() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); first_id uuid; second_id uuid; n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('backup-test-fixture:'||actor::text,0));
  select count(*) into n from clinical_private.patients where clinician_id=actor;
  if n > 0 then
    if not exists (select 1 from clinical_private.patients where clinician_id=actor
      and (coalesce(payload->>'fixture','') not in ('backup-roundtrip-v1','patient-workflow-v1') or payload->'testOnly' is distinct from 'true'::jsonb))
      then return jsonb_build_object('patients',n,'already_present',true); end if;
    raise exception 'La prueba requiere una cuenta sin otros pacientes' using errcode='22023';
  end if;
  first_id := (clinical_private.clinical_patient_create('{"name":"FICTICIO · Prueba de copia A","testOnly":true,"fixture":"backup-roundtrip-v1","history":"Historia ficticia inicial"}'::jsonb)->>'id')::uuid;
  perform clinical_private.clinical_patient_save(first_id,1,'{"name":"FICTICIO · Prueba de copia A","testOnly":true,"fixture":"backup-roundtrip-v1","history":"Historia ficticia revisada · recuperación 🧪","treatment":{"passive":"Movilización ficticia","exercises":["Isométrico de cuádriceps"]}}'::jsonb);
  second_id := (clinical_private.clinical_patient_create('{"name":"FICTICIO · Prueba de copia B archivado","testOnly":true,"fixture":"backup-roundtrip-v1","history":"Ejemplo ficticio archivado"}'::jsonb)->>'id')::uuid;
  perform clinical_private.clinical_patient_archive(second_id,1);
  return jsonb_build_object('patients',2,'already_present',false);
end;
$$;
create or replace function clinical_private.clinical_backup_export_test() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); snapshot jsonb;
begin
  if (select count(*) from clinical_private.patients where clinician_id=actor)>500 then raise exception 'La copia supera 500 fichas; no se ha recortado' using errcode='54000';end if;
  if exists (
    select 1 from clinical_private.patients where clinician_id=actor and
      (coalesce(payload->>'fixture','') not in ('backup-roundtrip-v1','patient-workflow-v1') or payload->'testOnly' is distinct from 'true'::jsonb)
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
    'format','mlrehab-clinical-test-snapshot','version',5,'test_only',true,'clinician_id',actor,
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
