import { NextResponse } from 'next/server';
import { fetchAuthMutation, fetchAuthQuery } from '@/lib/auth-server';
import { api } from '@/convex/_generated/api';
import { aiLog, aiError } from '@/lib/ai/logger';

export async function POST(req: Request) {
  const requestId = `ai-preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  aiLog(requestId, 'Incoming preview upload');

  try {
    const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
    if (!user) {
      aiLog(requestId, 'Unauthorized preview upload');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') ?? 'image/png';
    const arrayBuffer = await req.arrayBuffer();
    if (!arrayBuffer.byteLength) {
      return NextResponse.json({ error: 'Empty preview body' }, { status: 400 });
    }

    const uploadUrl = await fetchAuthMutation(api.ai.generatePreviewUploadUrl, {});
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: Buffer.from(arrayBuffer),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      aiError(requestId, 'Preview upload failed', errorText);
      return NextResponse.json({ error: 'Preview upload failed' }, { status: 500 });
    }

    const { storageId } = await uploadResponse.json();
    const { url } = await fetchAuthQuery(api.ai.getPreviewUrl, { storageId });

    aiLog(requestId, 'Preview uploaded', { storageId, bytes: arrayBuffer.byteLength });
    return NextResponse.json({
      url,
      storageId,
      bytes: arrayBuffer.byteLength,
      contentType,
    });
  } catch (error) {
    aiError(requestId, 'Preview upload error', error);
    return NextResponse.json({ error: 'Preview upload failed' }, { status: 500 });
  }
}
