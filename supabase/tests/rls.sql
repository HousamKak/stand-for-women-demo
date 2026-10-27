-- Run only in a development/staging Supabase SQL editor after migration 001.
-- All fixtures and edits roll back. Successful completion raises no exceptions.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','sfw-rls-admin@example.invalid'),
 ('10000000-0000-0000-0000-000000000002','sfw-rls-user@example.invalid');
insert into public.admins(user_id) values ('10000000-0000-0000-0000-000000000001');
insert into public.content_entries(id,kind,title,status,data) values
 ('20000000-0000-0000-0000-000000000001','partners','RLS public fixture','published','{}'),
 ('20000000-0000-0000-0000-000000000002','partners','RLS private fixture','draft','{}');

set local role anon;
do $$ begin
 if (select count(*) from public.content_entries where id in ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002')) <> 1 then raise exception 'Anonymous visibility failed'; end if;
 begin insert into public.content_entries(kind,title) values('partners','Forbidden'); raise exception 'Anonymous write allowed'; exception when insufficient_privilege then null; end;
 begin perform * from public.contact_submissions; raise exception 'Anonymous submissions read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
do $$ declare affected integer; begin
 if public.is_content_admin() then raise exception 'Ordinary user became admin'; end if;
 if exists(select 1 from public.content_entries where id='20000000-0000-0000-0000-000000000002') then raise exception 'Ordinary user read draft'; end if;
 begin insert into public.content_entries(kind,title) values('partners','Forbidden'); raise exception 'Ordinary user inserted content'; exception when insufficient_privilege then null; end;
 update public.content_entries set title='Forbidden' where id='20000000-0000-0000-0000-000000000001';
 get diagnostics affected = row_count; if affected<>0 then raise exception 'Ordinary user updated content'; end if;
 delete from public.content_entries where id='20000000-0000-0000-0000-000000000001';
 get diagnostics affected = row_count; if affected<>0 then raise exception 'Ordinary user deleted content'; end if;
 begin insert into public.admins(user_id) values(auth.uid()); raise exception 'Self-elevation allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
do $$ declare new_id uuid; affected integer; begin
 if not public.is_content_admin() then raise exception 'Admin check failed'; end if;
 if not exists(select 1 from public.content_entries where id='20000000-0000-0000-0000-000000000002') then raise exception 'Admin cannot read draft'; end if;
 insert into public.content_entries(kind,title,status) values('partners','Admin created fixture','draft') returning id into new_id;
 update public.content_entries set status='published' where id=new_id;
 get diagnostics affected = row_count; if affected<>1 then raise exception 'Admin update failed'; end if;
 delete from public.content_entries where id=new_id;
 get diagnostics affected = row_count; if affected<>1 then raise exception 'Admin delete failed'; end if;
end $$;
reset role;
rollback;
