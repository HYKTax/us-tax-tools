create index if not exists documents_released_by_idx
  on public.documents(released_by)
  where released_by is not null;
