import {API_BASE_URL} from '../config';
import {readAccessToken} from '../auth/tokenStore';
export async function uploadMedia(file: {uri: string; name: string; type: string}) { const token = await readAccessToken(); const form = new FormData(); form.append('file', file as unknown as Blob); const response = await fetch(`${API_BASE_URL}/api/media/upload`, {method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {}, body: form}); if (!response.ok) throw new Error('Media upload failed'); return response.json(); }
