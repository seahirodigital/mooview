import { handleMoomooRequest } from '../../server/moomooHandler.js';

export default async function handler(request: any, response: any) {
  return handleMoomooRequest('quotes', request, response);
}
