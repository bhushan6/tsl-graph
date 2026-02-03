import dynamic from 'next/dynamic';

const FlowPreview = dynamic(() => import('./FlowPreview').then(mod => mod.FlowPreview), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-[#1a1a1a]" />
});

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

import { ThemeToggle } from '@/components/ThemeToggle';

export default function LandingPage() {
    return (
        <div className="relative w-full h-screen overflow-hidden bg-[#1a1a1a] text-white font-sans">
            <div className="absolute inset-0 z-0">
                <FlowPreview />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent pointer-events-none" />
            </div>

            <div className="relative z-10 w-full h-full flex flex-col pointer-events-none">
                <header className="w-full p-6 flex justify-between items-center pointer-events-none">
                    <div className="flex items-center gap-2">
                        <Logo size="lg" className="text-white [&_span]:text-white [&_span.text-muted-foreground]:text-white/60" />
                    </div>
                    <div className="flex gap-4 items-center">
                        <ThemeToggle className="pointer-events-auto dark:text-white text-black hover:bg-white hover:text-black" />
                        <Button size="sm" asChild className="pointer-events-auto bg-transparent dark:text-white text-black hover:bg-white hover:text-black">
                            <Link href="/sign-in">Sign In</Link>
                        </Button>
                        <Button size="sm" asChild className="shadow-md pointer-events-auto">
                            <Link href="/dashboard">Launch Editor <ArrowRight className="ml-2 w-4 h-4" /></Link>
                        </Button>
                    </div>
                </header>

                <main className="flex-1 flex flex-col justify-center p-8 md:p-16 gap-8 max-w-3xl">
                    <div className="space-y-6 pointer-events-none">
                        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                            Create Shaders <br />Visually
                        </h1>
                        <p className="text-lg md:text-xl text-gray-300 max-w-lg leading-relaxed font-light">
                            Build powerful Three js shaders with a node-based interface.
                            Export standard TSL code instantly.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button size="lg" className="h-12 px-8 text-base rounded-full shadow-lg shadow-primary/20 transition-transform hover:scale-105 pointer-events-auto" asChild>
                                <Link href="/dashboard">Start Creating</Link>
                            </Button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
