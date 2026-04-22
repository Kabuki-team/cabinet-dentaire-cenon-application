import type { FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

export function makeAuthHook(expectedToken: string) {
  const expected = Buffer.from(expectedToken, 'utf8');

  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers['x-office-token'];
    const provided = typeof header === 'string' ? header : '';
    const providedBuf = Buffer.from(provided, 'utf8');

    if (
      providedBuf.length !== expected.length ||
      !timingSafeEqual(providedBuf, expected)
    ) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  };
}
