import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'lib', 'tsl-utils.ts');
        const source = await readFile(filePath, 'utf8');
        return new NextResponse(source, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read tsl-utils source';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
