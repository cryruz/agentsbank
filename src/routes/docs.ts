import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { specs } from '../config/swagger.js';

export const docsRouter = express.Router();

/**
 * Swagger UI documentation
 */
docsRouter.use('/', swaggerUi.serve);
docsRouter.get('/', swaggerUi.setup(specs, { explorer: true }));

/**
 * OpenAPI JSON spec
 */
docsRouter.get('/json', (_req, res) => {
  res.json(specs);
});

/**
 * OpenAPI YAML spec
 */
docsRouter.get('/yaml', (_req, res) => {
  res.type('application/yaml').send(specs);
});
