// En la web las peticiones van a /api/... porque el front y el backend estan
// en el mismo dominio. Aqui no hay dominio, asi que hay que poner la URL entera.
// Es exactamente el mismo backend que usa la web.
export const API_URL = 'https://quick-arrival-app.vercel.app';

// Si quiero probar contra el backend en local (npm run dev:vercel) tengo que
// poner la IP de mi PC en el wifi, no localhost: desde el movil localhost
// es el propio movil.
// export const API_URL = 'http://192.168.1.XX:3000';
