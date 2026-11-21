-- Test environment only: require a live provider session for every guarded operation.
begin;
create or replace function clinical_private.require_clinician() returns uuid
language plpgsql stable security definer set search_path = pg_catalog as $$
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
      where c.user_id=actor and c.enabled and u.email_confirmed_at is not null
        and (u.banned_until is null or u.banned_until <= statement_timestamp())
    ) or not exists (
      select 1 from auth.sessions s
      where s.id=session_uuid and s.user_id=actor and s.aal::text='aal2'
        and (s.not_after is null or s.not_after > statement_timestamp())
        and s.created_at > statement_timestamp() - interval '8 hours'
    ) then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;
  return actor;
end;
$$;
revoke all on function clinical_private.require_clinician() from public,anon,authenticated;

-- Verifies access without fetching clinical records or returning identifiers/tokens.
create function clinical_private.clinical_access_check() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  perform clinical_private.require_clinician();
  return jsonb_build_object('authorized',true);
end;
$$;
revoke all on function clinical_private.clinical_access_check() from public,anon;
grant execute on function clinical_private.clinical_access_check() to authenticated;
create function public.clinical_access_check() returns jsonb
language sql stable security invoker set search_path = pg_catalog
as $$ select clinical_private.clinical_access_check() $$;
revoke all on function public.clinical_access_check() from public,anon;
grant execute on function public.clinical_access_check() to authenticated;
commit;
