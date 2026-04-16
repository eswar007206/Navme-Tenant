create or replace function public.change_admin_password(
  p_admin_id uuid,
  p_current_password text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.dashboard_admins%rowtype;
begin
  if coalesce(length(trim(p_new_password)), 0) < 8 then
    raise exception 'New password must be at least 8 characters long.';
  end if;

  select *
  into v_admin
  from public.dashboard_admins
  where id = p_admin_id;

  if v_admin is null then
    raise exception 'Admin account not found.';
  end if;

  if not (v_admin.password_hash = crypt(p_current_password, v_admin.password_hash)) then
    raise exception 'Current password is incorrect.';
  end if;

  if v_admin.password_hash = crypt(p_new_password, v_admin.password_hash) then
    raise exception 'Choose a new password different from the current one.';
  end if;

  update public.dashboard_admins
  set password_hash = crypt(p_new_password, gen_salt('bf', 10))
  where id = p_admin_id;

  return true;
end;
$$;

grant execute on function public.change_admin_password(uuid, text, text)
  to anon, authenticated;
