-- Wishy 1.7 : modèles 3D des articles (GLB), lisibles publiquement (partage, réalité augmentée),
-- écrits uniquement par leur propriétaire dans son dossier <user_id>/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', true, 20971520, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do update set public = true, file_size_limit = 20971520, allowed_mime_types = excluded.allowed_mime_types;

create policy "models: ajout dans son dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'models' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "models: mise à jour de ses fichiers" on storage.objects for update to authenticated
  using (bucket_id = 'models' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "models: suppression de ses fichiers" on storage.objects for delete to authenticated
  using (bucket_id = 'models' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "models: lecture de ses fichiers" on storage.objects for select to authenticated
  using (bucket_id = 'models' and (storage.foldername(name))[1] = (select auth.uid())::text);
