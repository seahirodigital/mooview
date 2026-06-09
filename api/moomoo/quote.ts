import { handleMoomooRequest } from '../../server/moomooHandler.js';

export default async function handler(request: any, response: any) {
  return handleMoomooRequest('quote', request, response);
}
