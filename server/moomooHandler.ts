import type { Request, Response } from 'express';
import { callMoomooGateway, type MoomooAction } from './moomooClient';

export async function handleMoomooRequest(
  action: MoomooAction,
  request: Pick<Request, 'method' | 'body'>,
  response: Pick<Response, 'status' | 'json'>,
) {
  if (request.method !== 'POST') {
    return response.status(405).json({
      success: false,
      error: 'POSTメソッドを使用してください。',
    });
  }

  const payload =
    request.body && typeof request.body === 'object' ? request.body : {};
  const result = await callMoomooGateway(action, payload);
  return response.status(result.status).json(result.data);
}
