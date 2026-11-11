-- DEVELOPMENT FOUNDATION ONLY. Apply to an empty Supabase test project, never to clinical data.
-- No account is admitted by default. Enrollment is an administrator operation outside this API.
begin;
create schema clinical_private;
revoke all on schema clinical_private from public, anon, authenticated;

create table clinical_private.authorized_clinicians (
  user_id uuid primary key references auth.users(id),
  enabled boolean not null default false
);
create table clinical_private.patients (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references clinical_private.authorized_clinicians(user_id),
  payload jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index patients_owner_id on clinical_private.patients(clinician_id, id);
create table clinical_private.patient_versions (
  patient_id uuid not null references clinical_private.patients(id),
  revision integer not null,
  payload jsonb not null,
  archived boolean not null,
  created_at timestamptz not null default now(),
  primary key(patient_id, revision)
);
create table clinical_private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  patient_id uuid,
  action text not null check (action in ('patient.list','patient.read','patient.create','patient.update','patient.archive')),
  revision integer,
  created_at timestamptz not null default now()
);
-- Defense in depth: even an accidental future table grant meets default-deny RLS.
alter table clinical_private.authorized_clinicians enable row level security;
alter table clinical_private.patients enable row level security;
alter table clinical_private.patient_versions enable row level security;
alter table clinical_private.audit_events enable row level security;
revoke all on all tables in schema clinical_private from public, anon, authenticated;
revoke all on all sequences in schema clinical_private from public, anon, authenticated;
alter default privileges in schema clinical_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema clinical_private revoke all on functions from public, anon, authenticated;

create function clinical_private.require_clinician() returns uuid
language plpgsql stable security definer set search_path = pg_catalog as $$
declare actor uuid := auth.uid();
begin
  if actor is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' or not exists (
    select 1 from clinical_private.authorized_clinicians where user_id = actor and enabled
  ) then raise exception 'Acceso no autorizado' using errcode = '42501'; end if;
  return actor;
end;
$$;
create function clinical_private.validate_payload(value jsonb) returns void
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if value is null or jsonb_typeof(value) <> 'object' or jsonb_typeof(value->'name') is distinct from 'string'
    or char_length(btrim(value->>'name')) not between 1 and 150
    or octet_length(value::text) > 1048576 then
    raise exception 'Registro de paciente no válido' using errcode = '22023';
  end if;
end;
$$;
revoke all on function clinical_private.require_clinician() from public, anon, authenticated;
revoke all on function clinical_private.validate_payload(jsonb) from public, anon, authenticated;

create function public.clinical_patient_create(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); saved clinical_private.patients;
begin
  perform clinical_private.validate_payload(p_payload);
  insert into clinical_private.patients(clinician_id,payload) values(actor,p_payload) returning * into saved;
  insert into clinical_private.patient_versions values(saved.id,saved.revision,saved.payload,false,now());
  insert into clinical_private.audit_events(actor_id,patient_id,action,revision) values(actor,saved.id,'patient.create',saved.revision);
  return jsonb_build_object('id',saved.id,'revision',saved.revision);
end;
$$;
create function public.clinical_patient_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); loaded clinical_private.patients;
begin
  select * into loaded from clinical_private.patients where id=p_id and clinician_id=actor;
  if not found then raise exception 'Registro no disponible' using errcode = '42501'; end if;
  insert into clinical_private.audit_events(actor_id,patient_id,action,revision) values(actor,loaded.id,'patient.read',loaded.revision);
  return jsonb_build_object('id',loaded.id,'revision',loaded.revision,'payload',loaded.payload,'archived_at',loaded.archived_at);
end;
$$;
create function public.clinical_patient_list(p_after uuid default null, p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'Paginación no válida' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name','revision',revision,'updated_at',updated_at) order by id),'[]'::jsonb)
    into result from (select * from clinical_private.patients where clinician_id=actor and archived_at is null
    and (p_after is null or id > p_after) order by id limit p_limit) as visible;
  insert into clinical_private.audit_events(actor_id,action) values(actor,'patient.list');
  return result;
end;
$$;
create function public.clinical_patient_save(p_id uuid,p_expected_revision integer,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); saved clinical_private.patients;
begin
  perform clinical_private.validate_payload(p_payload);
  update clinical_private.patients set payload=p_payload,revision=revision+1,updated_at=now()
    where id=p_id and clinician_id=actor and revision=p_expected_revision and archived_at is null returning * into saved;
  if not found then raise exception 'Versión antigua o registro no disponible' using errcode='40001'; end if;
  insert into clinical_private.patient_versions values(saved.id,saved.revision,saved.payload,false,now());
  insert into clinical_private.audit_events(actor_id,patient_id,action,revision) values(actor,saved.id,'patient.update',saved.revision);
  return jsonb_build_object('id',saved.id,'revision',saved.revision);
end;
$$;
create function public.clinical_patient_archive(p_id uuid,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); saved clinical_private.patients;
begin
  update clinical_private.patients set archived_at=now(),revision=revision+1,updated_at=now()
    where id=p_id and clinician_id=actor and revision=p_expected_revision and archived_at is null returning * into saved;
  if not found then raise exception 'Versión antigua o registro no disponible' using errcode='40001'; end if;
  insert into clinical_private.patient_versions values(saved.id,saved.revision,saved.payload,true,now());
  insert into clinical_private.audit_events(actor_id,patient_id,action,revision) values(actor,saved.id,'patient.archive',saved.revision);
  return jsonb_build_object('id',saved.id,'revision',saved.revision);
end;
$$;
revoke all on function public.clinical_patient_create(jsonb) from public, anon;
revoke all on function public.clinical_patient_get(uuid) from public, anon;
revoke all on function public.clinical_patient_list(uuid,integer) from public, anon;
revoke all on function public.clinical_patient_save(uuid,integer,jsonb) from public, anon;
revoke all on function public.clinical_patient_archive(uuid,integer) from public, anon;
grant execute on function public.clinical_patient_create(jsonb) to authenticated;
grant execute on function public.clinical_patient_get(uuid) to authenticated;
grant execute on function public.clinical_patient_list(uuid,integer) to authenticated;
grant execute on function public.clinical_patient_save(uuid,integer,jsonb) to authenticated;
grant execute on function public.clinical_patient_archive(uuid,integer) to authenticated;
commit;
