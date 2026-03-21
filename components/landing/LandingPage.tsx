import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import DemoEditor from './demo-editor';

export default function LandingPage() {

    return (
        <div className="min-h-screen bg-[#FDFCFD] dark:bg-[#0A0A0A] text-[#201D1D] dark:text-[#EAEAEA] font-mono selection:bg-[#201D1D] dark:selection:bg-[#EAEAEA] selection:text-[#FDFCFD] dark:selection:text-[#0A0A0A]">
            <header className="w-full px-6 py-4 flex justify-between items-center border-b border-[#201D1D]/5 dark:border-[#EAEAEA]/10">
                <div className="flex items-center gap-2">
                    <Logo size="lg" className="text-[#201D1D] dark:text-[#EAEAEA]" />
                </div>
                <div className="flex gap-4 sm:gap-6 items-center text-sm">
                    {/* <Link href="https://github.com/anomalyco/tsl-editor" className="hover:opacity-70 transition-opacity hidden sm:block">GitHub</Link> */}
                    {/* <Link href="/docs/nodes" className="hover:opacity-70 transition-opacity hidden sm:block">Docs</Link> */}
                    <ThemeToggle className="text-[#201D1D] dark:text-[#EAEAEA] hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md" />
                    <Button size="sm" asChild className="bg-[#201D1D] dark:bg-[#EAEAEA] text-[#FDFCFD] dark:text-[#0A0A0A] hover:bg-[#201D1D]/90 dark:hover:bg-[#EAEAEA]/90 rounded-[4px] px-4 font-mono">
                        <Link href="/dashboard">Launch Editor <ArrowRight className="ml-2 w-4 h-4" /></Link>
                    </Button>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center pt-24 px-6 gap-12 max-w-6xl mx-auto w-full">
                <div className="flex flex-col items-center text-center space-y-8 max-w-4xl">
                    <div className="inline-flex items-center gap-3 text-sm text-[#9A9898] dark:text-[#A1A1AA]">
                        <span className="bg-[#201D1D] dark:bg-[#EAEAEA] text-[#FDFCFD] dark:text-[#0A0A0A] rounded-[4px] px-2 py-0.5 text-xs font-bold uppercase tracking-wider">New</span>
                        <span>Editor playground available. No login required.</span>
                    </div>

                    <h1 className="text-[32px] sm:text-[42px] md:text-[56px] font-bold leading-[1.2] tracking-tight text-[#201D1D] dark:text-[#EAEAEA]">
                        Create Shaders <br className="hidden sm:block" /> with node based interface
                    </h1>

                    <p className="text-base sm:text-lg text-[#9A9898] dark:text-[#A1A1AA] leading-relaxed max-w-xl mx-auto">
                        Build powerful Three.js shaders visually with a node-based interface.
                        Export standard TSL code instantly.
                    </p>
                </div>

                <div className="w-full mt-4 mb-24">
                    <div className="w-full bg-white dark:bg-[#0A0A0A] rounded-xl border border-[#201D1D]/10 dark:border-[#EAEAEA]/10 shadow-sm overflow-hidden relative h-[70vh] min-h-[600px]">
                        <DemoEditor />
                    </div>
                </div>

                {/* Features Section - Opencode Style */}
                <div className="w-full max-w-5xl mx-auto py-24 px-6 border-t border-[#201D1D]/10 dark:border-[#EAEAEA]/10">
                    <div className="flex flex-col gap-12">
                        {/* Header */}
                        <div className="w-full space-y-4">
                            <h3 className="text-3xl font-bold text-[#201D1D] dark:text-[#EAEAEA]">Features</h3>
                        </div>
                        {/* List */}
                        <div className="w-full">
                            <ul className="flex flex-col space-y-6 text-sm sm:text-base">
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Visual Node Editor</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Drag-and-drop interface for building Three.js TSL shaders without writing GLSL.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">TSL Code Export</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">One-click export of the entire graph as clean, standard Three.js JavaScript code.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Real-time Preview</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">See shader updates live on a 3D model with a fast feedback loop.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Rich Node Library</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Over 200+ built-in nodes covering math, textures, and geometry, with more being added.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Code Nodes</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Write raw TSL or GLSL code snippets directly inside the graph for ultimate flexibility.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Subgraph Nodes</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Group complex chunks of node logic into a single, clean reusable block to keep graphs organized.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Post-Processing & MRT</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Prototype complete VFX pipelines using full-screen quads and multiple render targets.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Local Variables</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Define and reuse variables with proper scoping for cleaner, powerful graph logic.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Smart UX & Routing</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Intelligent edge connections, full undo/redo stack, and rapid node search palette.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Debug & Inspect</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Hover over or pin nodes to see real-time value previews during live editing.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Organization Tools</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Add floating comments, utilize pan/zoom controls, and organize large graphs effortlessly.</span></div>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#9A9898] dark:text-[#A1A1AA] shrink-0">[*]</span>
                                    <div><strong className="text-[#201D1D] dark:text-[#EAEAEA] font-bold">Instant Share Links</strong> <span className="text-[#9A9898] dark:text-[#A1A1AA]">Every graph gets a public URL allowing others to view, remix, or fork your work.</span></div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* FAQ Section */}
                <div className="w-full max-w-3xl mx-auto py-24 border-t border-[#201D1D]/10 dark:border-[#EAEAEA]/10">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold tracking-tight text-[#201D1D] dark:text-[#EAEAEA]">Frequently Asked Questions</h2>
                    </div>
                    <Accordion type="single" collapsible className="w-full dark:text-[#EAEAEA]">
                        <AccordionItem value="item-1">
                            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-[#9A9898] dark:hover:text-[#A1A1AA] transition-colors">What is TSL?</AccordionTrigger>
                            <AccordionContent className="text-[#9A9898] dark:text-[#A1A1AA] text-base leading-relaxed">
                                TSL (Three.js Shading Language) is a modern node-based ecosystem built directly into Three.js, allowing you to write shaders using JavaScript/TypeScript instead of raw GLSL strings.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-2">
                            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-[#9A9898] dark:hover:text-[#A1A1AA] transition-colors">Is it free to use?</AccordionTrigger>
                            <AccordionContent className="text-[#9A9898] dark:text-[#A1A1AA] text-base leading-relaxed">
                                Yes, the TSL Graph editor is open source and entirely free to use.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-3">
                            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-[#9A9898] dark:hover:text-[#A1A1AA] transition-colors">Can I use the exported code anywhere?</AccordionTrigger>
                            <AccordionContent className="text-[#9A9898] dark:text-[#A1A1AA] text-base leading-relaxed">
                                Absolutely! The exported TSL code is pure JavaScript and works natively with any modern Three.js setup that supports WebGPU/TSL.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-4">
                            <AccordionTrigger className="text-lg font-bold hover:no-underline hover:text-[#9A9898] dark:hover:text-[#A1A1AA] transition-colors">Do I need an account?</AccordionTrigger>
                            <AccordionContent className="text-[#9A9898] dark:text-[#A1A1AA] text-base leading-relaxed">
                                You can try out the standalone playground without an account. However, to save your projects and access them later, you&apos;ll need to create a free account.
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </main>

            <footer className="w-full py-8 border-t border-[#201D1D]/10 dark:border-[#EAEAEA]/10 text-center text-[#9A9898] dark:text-[#A1A1AA] text-sm hidden sm:block">
                <p>© {new Date().getFullYear()} TSL Graph Editor. All rights reserved.</p>
            </footer>
        </div>
    );
}
