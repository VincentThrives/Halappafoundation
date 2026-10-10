// Production settings (ng build). The backend must allow this site's address in CORS_ORIGINS.
export const environment = {
  production: true,
  /** Spring Boot backend; every /api and /uploads request is sent here. */
  apiUrl: 'https://amogha-gold-billingsoftware.onrender.com',
};
