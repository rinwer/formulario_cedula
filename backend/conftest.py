import os

# main.py exige estas variables al importarse (se conecta a Supabase con
# la service_role key). Para las pruebas no hace falta un proyecto real:
# create_client no hace ninguna llamada de red al construirse, solo
# arma la configuracion del cliente. Se usa setdefault para no pisar
# credenciales reales si alguien corre pytest con un .env cargado.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-service-role-key")
