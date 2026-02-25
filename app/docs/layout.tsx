import Link from 'next/link';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex w-full max-w-7xl gap-10 px-6 py-12">
                <aside className="hidden w-56 shrink-0 flex-col gap-4 md:flex">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Docs</div>
                    <nav className="flex flex-col gap-2 text-sm">
                        <Link
                            href="/docs/nodes"
                            className="rounded-md px-3 py-2 text-foreground transition hover:bg-muted"
                        >
                            Nodes
                        </Link>
                    </nav>
                </aside>
                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
