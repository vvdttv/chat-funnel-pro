UPDATE public.profiles
SET username = 'superadmin',
    display_name = 'Super Admin',
    updated_at = now()
WHERE user_id = '2f5a6c3d-e328-4dff-b23d-07bd71319feb';