import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { HelpCircle, Layers, Code, Keyboard, Monitor, MousePointer2, Zap, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TYPE_COLORS } from './TSLHandle';
import { TSLType } from '@/lib/types';

// Guide configuration
const COLOR_GUIDE: { label: string; type: TSLType }[] = [
    { label: 'Vectors (vec2-4)', type: 'vec3' },
    { label: 'Float', type: 'float' },
    { label: 'Int / IVec', type: 'int' },
    { label: 'Uint / UVec', type: 'uint' },
    { label: 'Bool / BVec', type: 'bool' },
    { label: 'Color', type: 'color' },
    { label: 'Matrix', type: 'mat4' },
    { label: 'Texture', type: 'sampler2D' },
    { label: 'Any', type: 'any' },
];

export function HelpDialog() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground transition-colors" title="Help & Documentation">
                    <HelpCircle className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[80vw] min-w-[70vw] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b shrink-0">
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        <DialogTitle>User Guide</DialogTitle>
                    </div>
                    <DialogDescription>
                        Comprehensive documentation for the TSL Graph Editor.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="overview" orientation="vertical" className="flex-1 flex min-h-0">
                    <div className="w-60 border-r bg-muted/10 shrink-0 flex flex-col pt-4">
                        <TabsList className="flex flex-col h-auto w-full gap-1 px-3 bg-transparent p-0">
                            <TabsTrigger
                                value="overview"
                                className="w-full justify-start px-3 py-2 h-9 font-normal data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:font-medium data-[state=active]:shadow-none rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <Monitor className="w-4 h-4 mr-3 shrink-0" />
                                Interface Overview
                            </TabsTrigger>
                            <TabsTrigger
                                value="nodes"
                                className="w-full justify-start px-3 py-2 h-9 font-normal data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:font-medium data-[state=active]:shadow-none rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <MousePointer2 className="w-4 h-4 mr-3 shrink-0" />
                                Working with Nodes
                            </TabsTrigger>
                            <TabsTrigger
                                value="subgraphs"
                                className="w-full justify-start px-3 py-2 h-9 font-normal data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:font-medium data-[state=active]:shadow-none rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <Layers className="w-4 h-4 mr-3 shrink-0" />
                                Subgraphs
                            </TabsTrigger>
                            <TabsTrigger
                                value="code-nodes"
                                className="w-full justify-start px-3 py-2 h-9 font-normal data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:font-medium data-[state=active]:shadow-none rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <Code className="w-4 h-4 mr-3 shrink-0" />
                                Code Nodes
                            </TabsTrigger>
                            <TabsTrigger
                                value="shortcuts"
                                className="w-full justify-start px-3 py-2 h-9 font-normal data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:font-medium data-[state=active]:shadow-none rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <Keyboard className="w-4 h-4 mr-3 shrink-0" />
                                Shortcuts
                            </TabsTrigger>
                            <TabsTrigger
                                value="misc"
                                className="w-full justify-start px-3 py-2 h-9 font-normal data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:font-medium data-[state=active]:shadow-none rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <FileText className="w-4 h-4 mr-3 shrink-0" />
                                Miscellaneous
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-8 max-w-3xl mx-auto space-y-10 pb-20">
                            <TabsContent value="overview" className="mt-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight mb-4">Interface Overview</h2>
                                    <p className="text-muted-foreground text-lg leading-relaxed">
                                        The TSL Editor mimics professional node-based tools. It allows you to build shaders visually by connecting logic blocks.
                                    </p>
                                </div>

                                <div className="grid gap-6">
                                    <div className="border rounded-lg p-5">
                                        <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
                                            <span className="bg-primary/10 text-primary w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono">1</span>
                                            Canvas (Center)
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            The infinite workspace where you build your graph.
                                            <span className="block mt-2 font-medium text-foreground/80">
                                                • Right-Click or Space to Pan<br />
                                                • Scroll to Zoom
                                            </span>
                                        </p>
                                    </div>

                                    <div className="border rounded-lg p-5">
                                        <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
                                            <span className="bg-primary/10 text-primary w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono">2</span>
                                            Node Picker (Left)
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            <strong>Click nodes</strong> from here to add them to the canvas. It includes standard Math, Color, and UV nodes, plus your saved <strong>Templates</strong>.
                                        </p>
                                    </div>

                                    <div className="border rounded-lg p-5">
                                        <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
                                            <span className="bg-primary/10 text-primary w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono">3</span>
                                            Properties & Preview (Right)
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Select a node to edit its values here. The 3D Preview shows the live result of your shader.
                                        </p>
                                    </div>

                                    <div className="border rounded-lg p-5">
                                        <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
                                            <span className="bg-primary/10 text-primary w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono">4</span>
                                            Bottom Toolbar
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Quick access to common actions:
                                            <span className="block mt-2 font-medium text-foreground/80">
                                                • Pan/Select Modes<br />
                                                • Create Subgraph (Group)<br />
                                                • Debug Mode (Bug Icon)<br />
                                                • View Generated Code
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="nodes" className="mt-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight mb-4">Working with Nodes</h2>
                                    <p className="text-muted-foreground leading-relaxed">
                                        Nodes are the building blocks of your shader. Data flows from Left to Right.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex gap-4 items-start">
                                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                                            <MousePointer2 className="w-5 h-5 text-green-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Adding Nodes</h3>
                                            <p className="text-muted-foreground mt-1">
                                                <strong>Click any node</strong> in the left panel to add it to the center of your view.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 items-start">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                                            <Zap className="w-5 h-5 text-blue-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Connections</h3>
                                            <p className="text-muted-foreground mt-1">
                                                Drag a wire from an <strong>Output</strong> to an <strong>Input</strong>.
                                                <br />
                                                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                                    {COLOR_GUIDE.map(({ label, type }) => (
                                                        <span key={type} className="flex items-center gap-1.5">
                                                            <span
                                                                className="w-2 h-2 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10"
                                                                style={{ backgroundColor: TYPE_COLORS[type] }}
                                                            />
                                                            {label}
                                                        </span>
                                                    ))}
                                                </div>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 items-start">
                                        <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                                            <MousePointer2 className="w-5 h-5 text-orange-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Quick Add</h3>
                                            <p className="text-muted-foreground mt-1">
                                                Drag a wire into empty space and release it to open a filtered <strong>Node Picker</strong>. This shows only nodes compatible with that connection.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 items-start">
                                        <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                                            <div className="w-5 h-5 text-orange-500 flex items-center justify-center">🐞</div>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Debug Mode</h3>
                                            <p className="text-muted-foreground mt-1">
                                                Click the <strong>Bug Icon</strong> in the toolbar to toggle Debug Mode.
                                                <br />
                                                When active, selecting any node shows a live <strong>3D Preview</strong> of its output in the Properties Panel.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="subgraphs" className="mt-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-primary/10 rounded-lg">
                                            <Layers className="w-6 h-6 text-primary" />
                                        </div>
                                        <h2 className="text-2xl font-bold tracking-tight">Subgraphs</h2>
                                    </div>
                                    <p className="text-muted-foreground text-lg leading-relaxed">
                                        Subgraphs allow you to bundle complex logic into a single, reusable node. They act just like functions in code.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    <div className="bg-muted/30 p-6 rounded-xl border">
                                        <h3 className="font-semibold mb-3">1. Creating a Subgraph</h3>
                                        <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
                                            <li>Select nodes you want to bundle (Box Select or <kbd className="bg-background px-1.5 py-0.5 rounded border text-xs">Shift + Drag</kbd>).</li>
                                            <li>Click the <strong>Create Subgraph</strong> (Layers icon) in the bottom toolbar.</li>
                                            <li>
                                                Name your new node. It is now saved as a <strong>Custom Node</strong>.
                                                <ul className="list-disc list-inside ml-4 mt-2 text-sm text-muted-foreground/80">
                                                    <li><strong>Automatic Ports:</strong> The editor automatically creates inputs/outputs based on existing connections.</li>
                                                    <li><strong>Manage Ports:</strong> To add or rename ports later, you must <strong>Edit the Subgraph</strong> (see below).</li>
                                                </ul>
                                            </li>
                                        </ol>
                                    </div>

                                    <div className="bg-muted/30 p-6 rounded-xl border">
                                        <h3 className="font-semibold mb-3">2. Editing Internals & Ports</h3>
                                        <p className="text-muted-foreground mb-4">
                                            You can define exactly what inputs and outputs your custom node has.
                                        </p>
                                        <ul className="space-y-3 text-sm text-muted-foreground">
                                            <li className="flex items-start gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                                                <span>
                                                    <strong>Enter Logic:</strong> Select the subgraph node and click <strong>&quot;Edit Subgraph&quot;</strong> in the Properties Panel.
                                                </span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                                                <span>
                                                    <strong>Manage Ports:</strong> Inside the subgraph, you will see special <strong>Input</strong> and <strong>Output</strong> anchor nodes. Select them to add, remove, or rename ports in the Properties Panel.
                                                </span>
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                                                <span>
                                                    <strong>Connect Logic:</strong> Build your graph between these anchors. The data flowing into the &quot;Output&quot; anchor becomes the result of your node.
                                                </span>
                                            </li>
                                        </ul>
                                    </div>

                                    <div className="bg-muted/30 p-6 rounded-xl border">
                                        <h3 className="font-semibold mb-3">Understanding Anchor Nodes</h3>
                                        <p className="text-muted-foreground mb-4">
                                            When editing a subgraph, you will see two special nodes fixed in the editor:
                                        </p>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="border rounded-lg p-3 bg-card/50">
                                                <h4 className="font-medium text-primary mb-1">Subgraph Input</h4>
                                                <p className="text-xs text-muted-foreground">
                                                    Represents data coming <em>into</em> your custom node.
                                                    <br />
                                                    <strong>Action:</strong> Select this node to add new input sockets (e.g., Color, Speed) to your custom node.
                                                </p>
                                            </div>
                                            <div className="border rounded-lg p-3 bg-card/50">
                                                <h4 className="font-medium text-primary mb-1">Subgraph Output</h4>
                                                <p className="text-xs text-muted-foreground">
                                                    Represents the final result sent <em>out</em> of your custom node.
                                                    <br />
                                                    <strong>Action:</strong> Connect your final calculation here.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                                        <h4 className="font-medium text-blue-500 flex items-center gap-2 mb-2">
                                            <Code className="w-4 h-4" />
                                            Developer Mental Model
                                        </h4>
                                        <p className="text-sm text-blue-500/90 leading-relaxed">
                                            Think of a Subgraph as a <strong>Function Definition</strong>:
                                        </p>
                                        <ul className="list-disc list-inside text-sm text-blue-500/90 mt-2 space-y-1 font-mono">
                                            <li><span className="font-bold">Subgraph Input Node</span> = Function Arguments <code>(a, b)</code></li>
                                            <li><span className="font-bold">Subgraph Output Node</span> = Return Statement <code>return result;</code></li>
                                            <li><span className="font-bold">Node Instance</span> = Function Call <code>myFunction(1, 2)</code></li>
                                        </ul>
                                    </div>

                                    <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
                                        <h4 className="font-medium text-yellow-500 flex items-center gap-2 mb-2">
                                            <Zap className="w-4 h-4" />
                                            Important Notes
                                        </h4>
                                        <ul className="list-disc list-inside text-sm text-yellow-500/90 space-y-1">
                                            <li>Subgraphs currently support only <strong>one output</strong>.</li>
                                            <li>Saved subgraphs appear in the <strong>Node Picker</strong> under &quot;Custom Nodes&quot; for easy reuse.</li>
                                        </ul>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="code-nodes" className="mt-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-primary/10 rounded-lg">
                                            <Code className="w-6 h-6 text-primary" />
                                        </div>
                                        <h2 className="text-2xl font-bold tracking-tight">Code Nodes</h2>
                                    </div>
                                    <p className="text-muted-foreground text-lg leading-relaxed">
                                        Sometimes a visual graph is too messy for simple math. Code Nodes let you write TSL directly.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    <div className="bg-muted/30 p-6 rounded-xl border">
                                        <h3 className="font-semibold mb-3">1. Creation & Input Detection</h3>
                                        <p className="text-muted-foreground mb-4">
                                            Click <strong>&quot;Create from Code...&quot;</strong> in the Node Picker.
                                            <br />
                                            The editor will <strong>automatically detect inputs</strong> based on your code arguments.
                                        </p>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="border rounded-lg p-3 bg-card/50">
                                                <h4 className="font-medium text-primary mb-1">Writing Code</h4>
                                                <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 mb-2">
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                                        ⚠️ Arguments must be destructured from an array: <code className="bg-amber-500/10 px-1 rounded">([a, b])</code>
                                                    </p>
                                                </div>
                                                <pre className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded">
                                                    {`Fn(([color, time]) => {
  // 'color' and 'time' become inputs
  return color * sin(time);
})`}
                                                </pre>
                                                <p className="text-xs text-muted-foreground mt-3">
                                                    Prefer WGSL? Switch the language selector to <strong>WGSL</strong> and write a raw function:
                                                </p>
                                                <pre className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded mt-2">
                                                    {`fn colorFn(baseColor: vec4f, uv: vec2f) -> vec4f {
  let red = (uv.x + 2.3) * 0.3;
  let green = (uv.y + 1.7) / 8.2;
  let blue = (uv.x + uv.y) % 10.0;
  return mix(baseColor, vec4f(red, green, blue, 1.0), uv.x);
}`}
                                                </pre>
                                            </div>
                                            <div className="border rounded-lg p-3 bg-card/50">
                                                <h4 className="font-medium text-primary mb-1">Configuring Types</h4>
                                                <p className="text-xs text-muted-foreground">
                                                    Once valid code is detected, a <strong>&quot;Input Types&quot;</strong> section appears.
                                                    <br />
                                                    Set <code>color</code> to <strong>Color</strong> and <code>time</code> to <strong>Float</strong> to ensure correct connections.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-muted/30 p-6 rounded-xl border">
                                        <h3 className="font-semibold mb-3">2. Coding Environment</h3>
                                        <p className="text-muted-foreground mb-4">
                                            You can write standard <strong>JavaScript</strong> and any <strong>TSL function</strong> available in three js.
                                        </p>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                                <h4 className="text-sm font-medium text-primary mb-1">What Works</h4>
                                                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                                                    <li>All TSL Math nodes (sin, mix, step...)</li>
                                                    <li>Vector operations (dot, cross, normalize)</li>
                                                    <li>Standard JS logic (ternary, variables)</li>
                                                </ul>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-medium text-destructive mb-1">Limitations</h4>
                                                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                                                    <li><strong>Sandboxed:</strong> No access to <code>window</code>, <code>document</code>, or global scope.</li>
                                                    <li>Code runs in strict isolation.</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="shortcuts" className="mt-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight mb-6">Keyboard Shortcuts</h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { key: "Ctrl + Z", label: "Undo" },
                                        { key: "Ctrl + Y", label: "Redo" },
                                        { key: "Delete", label: "Delete Selection" },
                                        { key: "Shift + Drag", label: "Box Selection" },
                                        { key: "Middle Mouse", label: "Pan Canvas" },
                                        { key: "Wheel", label: "Zoom" },
                                    ].map((shortcut) => (
                                        <div key={shortcut.label} className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                            <span className="text-sm font-medium">{shortcut.label}</span>
                                            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                                                {shortcut.key}
                                            </kbd>
                                        </div>
                                    ))}
                                </div>
                            </TabsContent>
                            <TabsContent value="misc" className="mt-0 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-primary/10 rounded-lg">
                                            <FileText className="w-6 h-6 text-primary" />
                                        </div>
                                        <h2 className="text-2xl font-bold tracking-tight">Miscellaneous</h2>
                                    </div>
                                    <p className="text-muted-foreground text-lg leading-relaxed">
                                        Additional features to help organize and visualize your work.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    <div className="border rounded-lg p-5">
                                        <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                                            <Layers className="w-5 h-5 text-blue-500" />
                                            Group Nodes
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                            Keep your graph organized by grouping related nodes together visually.
                                        </p>
                                        <ul className="space-y-2 text-sm text-foreground/80">
                                            <li className="flex gap-2">
                                                <span className="font-semibold min-w-[80px]">Create:</span>
                                                Select nodes and click the <strong>Group Icon</strong> in the toolbar.
                                            </li>
                                            <li className="flex gap-2">
                                                <span className="font-semibold min-w-[80px]">Interact:</span>
                                                Moving the group frame moves all nodes inside it.
                                            </li>
                                            <li className="flex gap-2">
                                                <span className="font-semibold min-w-[80px]">Rename:</span>
                                                Double-click the group label to rename it.
                                            </li>
                                        </ul>
                                    </div>

                                    <div className="border rounded-lg p-5">
                                        <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                                            <Monitor className="w-5 h-5 text-purple-500" />
                                            3D Preview
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                            The right panel shows a real-time WebGL preview of your shader.
                                        </p>
                                        <ul className="space-y-2 text-sm text-foreground/80">
                                            <li className="flex gap-2">
                                                <span className="font-semibold min-w-[80px]">Live Update:</span>
                                                Changes to the graph are reflected instantly.
                                            </li>
                                            <li className="flex gap-2">
                                                <span className="font-semibold min-w-[80px]">Geometry:</span>
                                                Currently displays on a sphere to visualize lighting and reflections.
                                            </li>
                                            <li className="flex gap-2">
                                                <span className="font-semibold min-w-[80px]">Light:</span>
                                                Includes a rotating light source to demonstrate roughness and normals.
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                    </ScrollArea>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
