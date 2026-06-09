import { handleMoomooRequest } from '../../server/moomooHandler';

export default async function handler(request: any, response: any) {
  return handleMoomooRequest('status', request, response);
}
