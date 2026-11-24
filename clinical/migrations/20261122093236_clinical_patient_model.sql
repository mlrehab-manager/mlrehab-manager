-- Clinical model candidate. All existing accounts stay in test mode.
begin;
alter table clinical_private.authorized_clinicians add column data_mode text not null default 'test' check(data_mode in ('test','clinical','suspended')),add column approval_reference text;
create table clinical_private.mode_events(id bigint generated always as identity primary key,clinician_id uuid not null references auth.users(id),previous_mode text,next_mode text not null,approval_reference text,database_role text not null,created_at timestamptz not null default now());
create index mode_events_owner on clinical_private.mode_events(clinician_id,id);
alter table clinical_private.mode_events enable row level security;
create policy deny_clients on clinical_private.mode_events as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on clinical_private.mode_events from public,anon,authenticated;
revoke all on sequence clinical_private.mode_events_id_seq from public,anon,authenticated;
create function clinical_private.validate_mode_transition() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if TG_OP='UPDATE' and old.data_mode<>'test' and new.data_mode='test' then raise exception 'Un entorno clínico no vuelve a modo de prueba' using errcode='22023';end if;
 if new.data_mode='clinical' then
  if new.approval_reference is null or char_length(btrim(new.approval_reference)) not between 1 and 200 then raise exception 'Falta la referencia de aprobación de puesta en marcha' using errcode='23514';end if;
  if TG_OP='INSERT' or old.data_mode='test' then
   if exists(select 1 from clinical_private.patients where clinician_id=new.user_id) or exists(select 1 from clinical_private.appointments where clinician_id=new.user_id) or exists(select 1 from clinical_private.clinical_sessions where clinician_id=new.user_id) or exists(select 1 from clinical_private.custom_exercises where clinician_id=new.user_id) or exists(select 1 from clinical_private.audit_events where actor_id=new.user_id) then raise exception 'La activación requiere un conjunto vacío, sin mezclar pruebas e historias' using errcode='23514';end if;
  elsif exists(select 1 from clinical_private.patients where clinician_id=new.user_id and payload->>'record_type' is distinct from 'clinical-patient-v1') then raise exception 'Datos incompatibles con el entorno clínico' using errcode='23514';end if;
 end if;
 return new;
end;$$;
create function clinical_private.record_mode_transition() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if TG_OP='INSERT' then
  if new.data_mode<>'test' then insert into clinical_private.mode_events(clinician_id,next_mode,approval_reference,database_role) values(new.user_id,new.data_mode,new.approval_reference,current_user);end if;
 elsif old.data_mode is distinct from new.data_mode or old.approval_reference is distinct from new.approval_reference then
  insert into clinical_private.mode_events(clinician_id,previous_mode,next_mode,approval_reference,database_role) values(new.user_id,old.data_mode,new.data_mode,new.approval_reference,current_user);
 end if;return new;
end;$$;
revoke all on function clinical_private.validate_mode_transition(),clinical_private.record_mode_transition() from public,anon,authenticated;
create trigger validate_mode before insert or update of data_mode,approval_reference on clinical_private.authorized_clinicians for each row execute function clinical_private.validate_mode_transition();
create trigger record_mode after insert or update of data_mode,approval_reference on clinical_private.authorized_clinicians for each row execute function clinical_private.record_mode_transition();


create or replace function clinical_private.require_clinician() returns uuid
language plpgsql volatile security definer set search_path = pg_catalog as $$
declare
  actor uuid := auth.uid();
  claims jsonb := auth.jwt();
  session_uuid uuid;
begin
  begin
    session_uuid := nullif(claims->>'session_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end;
  if actor is null or session_uuid is null or coalesce(claims->>'aal','') <> 'aal2'
    or not exists (
      select 1 from clinical_private.authorized_clinicians c
      join auth.users u on u.id=c.user_id
      where c.user_id=actor and c.enabled and c.data_mode<>'suspended' and u.email_confirmed_at is not null
        and (u.banned_until is null or u.banned_until <= statement_timestamp())
    ) or not exists (
      select 1 from auth.sessions s
      where s.id=session_uuid and s.user_id=actor and s.aal::text='aal2'
        and (s.not_after is null or s.not_after > statement_timestamp())
        and s.created_at > statement_timestamp() - interval '8 hours'
    ) then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;
  perform 1 from clinical_private.authorized_clinicians where user_id=actor and enabled and data_mode<>'suspended' for share;
  if not found then raise exception 'Acceso no autorizado' using errcode='42501';end if;
  return actor;
end;
$$;


create or replace function clinical_private.clinical_access_check() returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();begin return jsonb_build_object('authorized',true,'data_mode',(select data_mode from clinical_private.authorized_clinicians where user_id=actor));end;$$;
alter function public.clinical_access_check() volatile;
create function clinical_private.patient_in_mode(value jsonb,actor uuid) returns boolean language sql stable set search_path=pg_catalog as $$select case when (select data_mode from clinical_private.authorized_clinicians where user_id=actor)='clinical' then value->>'record_type'='clinical-patient-v1' else value->'testOnly'='true'::jsonb and value->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1') end$$;
revoke all on function clinical_private.patient_in_mode(jsonb,uuid) from public,anon,authenticated;
create function clinical_private.patient_identity(value jsonb,require_names boolean default true) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare result jsonb:='{}'::jsonb;field text;v text;born date;
begin
 if value is null or jsonb_typeof(value)<>'object' or exists(select 1 from jsonb_object_keys(value) k where k not in ('given_name','family_name','birth_date','phone','email')) then raise exception 'Identificación no válida' using errcode='22023';end if;
 foreach field in array array['given_name','family_name','birth_date','phone','email'] loop
  if value ? field and jsonb_typeof(value->field)<>'string' then raise exception 'La identificación requiere texto' using errcode='22023';end if;
  v:=coalesce(value->>field,'');
  if v~'[[:cntrl:]]' or v~U&'[\007F-\009F]' then raise exception 'Texto de identificación no válido' using errcode='22023';end if;
  v:=btrim(regexp_replace(v,U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g'));
  if field in ('given_name','family_name') and (char_length(v)>80 or (require_names and v='')) then raise exception 'Revisa nombre y apellidos' using errcode='22023';end if;
  if field='birth_date' and v<>'' then
   begin born:=v::date;exception when others then raise exception 'Fecha de nacimiento no válida' using errcode='22023';end;
   if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(born,'YYYY-MM-DD')<>v or born>(statement_timestamp() at time zone 'Europe/Madrid')::date then raise exception 'Fecha de nacimiento no válida' using errcode='22023';end if;
  end if;
  if field='phone' and (char_length(v)>32 or (v<>'' and (v!~'^[+0-9 ()/.-]+$' or regexp_replace(v,'[ ()/.-]','','g')!~'^\+?[0-9]{6,15}$'))) then raise exception 'Teléfono no válido' using errcode='22023';end if;
  if field='email' and (char_length(v)>254 or (v<>'' and v!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'Correo no válido' using errcode='22023';end if;
  result:=result||jsonb_build_object(field,v);
 end loop;
 return result;
end;$$;
revoke all on function clinical_private.patient_identity(jsonb,boolean) from public,anon,authenticated;
create function clinical_private.validate_clinical_patient(value jsonb) returns void language plpgsql stable set search_path=pg_catalog as $$
declare identity jsonb;field text;lim integer;
begin
 if value is null or jsonb_typeof(value)<>'object' or value->>'record_type' is distinct from 'clinical-patient-v1' or exists(select 1 from jsonb_object_keys(value) k where k not in ('record_type','name','given_name','family_name','birth_date','phone','email','reason','precautions','history','exam','diagnosis','goals')) then raise exception 'Ficha clínica no válida' using errcode='22023';end if;
 select jsonb_object_agg(k,value->k) into identity from unnest(array['given_name','family_name','birth_date','phone','email']) k;
 identity:=clinical_private.patient_identity(identity);
 if identity is distinct from (select jsonb_object_agg(k,value->k) from unnest(array['given_name','family_name','birth_date','phone','email']) k) or value->>'name' is distinct from (identity->>'given_name')||' '||(identity->>'family_name') then raise exception 'Identificación no canónica' using errcode='22023';end if;
 foreach field in array array['reason','precautions','history','exam','diagnosis','goals'] loop
  lim:=case when field in ('history','exam') then 8000 when field='precautions' then 4000 else 2000 end;
  if jsonb_typeof(value->field) is distinct from 'string' or char_length(value->>field)>lim then raise exception 'Campo clínico no válido' using errcode='22023';end if;
 end loop;
end;$$;
revoke all on function clinical_private.validate_clinical_patient(jsonb) from public,anon,authenticated;
create or replace function clinical_private.validate_payload(value jsonb) returns void language plpgsql volatile set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();mode text;
begin
 select data_mode into mode from clinical_private.authorized_clinicians where user_id=actor;
 if mode='clinical' then perform clinical_private.validate_clinical_patient(value);
 elsif value->>'record_type'='clinical-patient-v1' then raise exception 'El entorno clínico no está activado' using errcode='42501';
 elsif value is null or jsonb_typeof(value)<>'object' or jsonb_typeof(value->'name') is distinct from 'string' or char_length(btrim(value->>'name')) not between 1 and 150 or octet_length(value::text)>1048576 then raise exception 'Registro de paciente no válido' using errcode='22023';end if;
end;$$;
create function clinical_private.clinical_patient_register(p_identity jsonb,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();identity jsonb:=clinical_private.patient_identity(p_identity);saved clinical_private.patients;value jsonb;
begin
 if (select data_mode from clinical_private.authorized_clinicians where user_id=actor)<>'clinical' then raise exception 'El entorno clínico no está activado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Falta el identificador de petición' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('patient-register:'||actor::text,0));
 select * into saved from clinical_private.patients where id=p_request_id;
 if found then
  if saved.clinician_id<>actor then raise exception 'Petición no disponible' using errcode='42501';end if;
  if saved.payload->>'record_type'<>'clinical-patient-v1' or (select jsonb_object_agg(k,saved.payload->k) from unnest(array['given_name','family_name','birth_date','phone','email']) k) is distinct from identity then raise exception 'La petición ya se utilizó para otra ficha' using errcode='40001';end if;
  return jsonb_build_object('id',saved.id,'revision',saved.revision,'already_present',true);
 end if;
 if (select count(*) from clinical_private.patients where clinician_id=actor)>=500 then raise exception 'Límite de 500 fichas' using errcode='54000';end if;
 value:=identity||jsonb_build_object('record_type','clinical-patient-v1','name',(identity->>'given_name')||' '||(identity->>'family_name'),'reason','','precautions','','history','','exam','','diagnosis','','goals','');
 perform clinical_private.validate_payload(value);
 insert into clinical_private.patients(id,clinician_id,payload) values(p_request_id,actor,value) returning * into saved;
 insert into clinical_private.patient_versions values(saved.id,1,saved.payload,false,now());
 insert into clinical_private.audit_events(actor_id,patient_id,action,revision) values(actor,saved.id,'patient.create',1);
 return jsonb_build_object('id',saved.id,'revision',1,'already_present',false);
end;$$;
revoke all on function clinical_private.clinical_patient_register(jsonb,uuid) from public,anon;
grant execute on function clinical_private.clinical_patient_register(jsonb,uuid) to authenticated;
create function public.clinical_patient_register(p_identity jsonb,p_request_id uuid) returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_patient_register(p_identity,p_request_id)$$;
revoke all on function public.clinical_patient_register(jsonb,uuid) from public,anon;
grant execute on function public.clinical_patient_register(jsonb,uuid) to authenticated;


create or replace function clinical_private.clinical_patient_list_test() returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();result jsonb;
begin
 if (select count(*) from clinical_private.patients where clinician_id=actor)>500 then raise exception 'Lista demasiado grande; no se ha recortado' using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name','birth_date',payload->>'birth_date','revision',revision,'archived',archived_at is not null) order by archived_at is not null,id),'[]'::jsonb) into result from clinical_private.patients where clinician_id=actor and clinical_private.patient_in_mode(payload,actor);
 insert into clinical_private.audit_events(actor_id,action) values(actor,'patient.list');return result;
end;$$;

create or replace function clinical_private.clinical_patient_archive_test(p_id uuid,p_expected_revision integer) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();
begin
 if not exists(select 1 from clinical_private.patients where id=p_id and clinician_id=actor and clinical_private.patient_in_mode(payload,actor)) then raise exception 'Ficha no disponible' using errcode='42501';end if;
 return clinical_private.clinical_patient_archive(p_id,p_expected_revision);
end;$$;

create or replace function clinical_private.clinical_agenda_list_test(p_day date) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();result jsonb;
begin
  if p_day is null or p_day<'2020-01-01'::date or p_day>'2100-12-31'::date then raise exception 'Día no válido' using errcode='22023';end if;
  select jsonb_build_object('patients',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name') order by id),'[]'::jsonb) from clinical_private.patients where clinician_id=actor and archived_at is null and clinical_private.patient_in_mode(payload,actor)),
    'appointments',(select coalesce(jsonb_agg(clinical_private.appointment_json(a)||jsonb_build_object('patient_name',p.payload->>'name','patient_archived',p.archived_at is not null,'session_id',s.id) order by a.starts_at,a.id),'[]'::jsonb)
    from clinical_private.appointments a join clinical_private.patients p on p.id=a.patient_id left join clinical_private.clinical_sessions s on s.appointment_id=a.id
    where a.clinician_id=actor and clinical_private.patient_in_mode(p.payload,actor) and a.starts_at<(p_day+1)::timestamp at time zone 'Europe/Madrid' and a.ends_at>p_day::timestamp at time zone 'Europe/Madrid')) into result;
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
  if not exists(select 1 from clinical_private.patients where id=p_patient_id and clinician_id=actor and archived_at is null and clinical_private.patient_in_mode(payload,actor)) then raise exception 'Paciente no disponible' using errcode='42501';end if;
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
  if not exists(select 1 from clinical_private.patients where id=appt.patient_id and clinician_id=actor and archived_at is null and clinical_private.patient_in_mode(payload,actor)) then raise exception 'Paciente no disponible' using errcode='42501';end if;
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

create or replace function clinical_private.clinical_patient_create_test(p_alias text,p_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();alias text:=clinical_private.patient_alias(p_alias);saved clinical_private.patients;
begin
 if (select data_mode from clinical_private.authorized_clinicians where user_id=actor)<>'test' then raise exception 'Esta cuenta no usa el conjunto ficticio' using errcode='42501';end if;
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

create or replace function clinical_private.clinical_patient_save_fields_test(p_id uuid,p_expected_revision integer,p_fields jsonb) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.patients;field text;max_length integer;patch jsonb:=p_fields;alias text;identity jsonb;is_clinical boolean:=(select data_mode='clinical' from clinical_private.authorized_clinicians where user_id=actor);
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or p_fields='{}'::jsonb then raise exception 'Campos no válidos' using errcode='22023';end if;
 for field in select jsonb_object_keys(p_fields) loop
  if field not in ('history','exam','diagnosis','goals','alias','reason','precautions','given_name','family_name','birth_date','phone','email') or jsonb_typeof(p_fields->field)<>'string' then raise exception 'Campo no editable' using errcode='22023';end if;
  max_length:=case when field in ('history','exam') then 8000 when field in ('alias','given_name','family_name') then 80 when field='birth_date' then 10 when field='phone' then 32 when field='email' then 254 when field='precautions' then 4000 else 2000 end;
  if char_length(p_fields->>field)>max_length then raise exception 'Texto demasiado largo' using errcode='22023';end if;
 end loop;
 select * into saved from clinical_private.patients where id=p_id and clinician_id=actor and clinical_private.patient_in_mode(payload,actor) for update;
 if not found or saved.archived_at is not null or saved.revision is distinct from p_expected_revision then raise exception 'Versión antigua o ficha no disponible' using errcode='40001';end if;
 if is_clinical and p_fields ? 'alias' then raise exception 'La ficha clínica usa nombre y apellidos' using errcode='22023';end if;
 if p_fields ? 'alias' then
  if saved.payload->>'fixture'<>'patient-workflow-v1' then raise exception 'El nombre de las fichas iniciales se conserva' using errcode='22023';end if;
  alias:=clinical_private.patient_alias(p_fields->>'alias');patch:=patch||jsonb_build_object('alias',alias,'name','FICTICIO · '||alias);
 end if;
 if p_fields ?| array['given_name','family_name','birth_date','phone','email'] then
  select coalesce(jsonb_object_agg(k,(saved.payload||p_fields)->k),'{}'::jsonb) into identity from unnest(array['given_name','family_name','birth_date','phone','email']) k where (saved.payload||p_fields) ? k;
  identity:=clinical_private.patient_identity(identity,is_clinical);patch:=patch||identity;
  if is_clinical then patch:=patch||jsonb_build_object('name',(identity->>'given_name')||' '||(identity->>'family_name'));end if;
 end if;
 return clinical_private.clinical_patient_save(p_id,p_expected_revision,saved.payload||patch);
end;$$;

create or replace function clinical_private.clinical_backup_export_test() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); snapshot jsonb;is_clinical boolean:=(select data_mode='clinical' from clinical_private.authorized_clinicians where user_id=actor);
begin
  if (select count(*) from clinical_private.patients where clinician_id=actor)>500 then raise exception 'La copia supera 500 fichas; no se ha recortado' using errcode='54000';end if;
  if exists (
    select 1 from clinical_private.patients where clinician_id=actor and
      not coalesce(clinical_private.patient_in_mode(payload,actor),false)
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
  if is_clinical then snapshot:=(snapshot-'test_only')||jsonb_build_object('format','mlrehab-clinical-snapshot','version',6,'data_mode','clinical');end if;
  return snapshot;
end;
$$;

commit;
