import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyPlus, Sparkles, Zap, Box } from "lucide-react";

interface Preset {
    name: string;
    description: string;
    url: string;
    // icon: React.ElementType;
    gradient: string;
}

const PRESETS: Preset[] = [
    {
        name: "Galaxy",
        description: "A swirling galaxy particle simulation locally.",
        url: "/galaxy.json",
        // icon: Sparkles,
        // Deep space purple/blue gradient
        gradient: "from-indigo-900 via-purple-900 to-black"
    },
    {
        name: "Noise Gradient",
        description: "Smooth procedural noise based color gradients.",
        url: "/noise-gradient.json",
        // icon: Zap,
        // Vibrant neon gradients
        gradient: "from-pink-500 via-red-500 to-yellow-500"
    },
    {
        name: "SDF Circles",
        description: "SDF Circles pattern.",
        url: "/sdf-circles.json",
        // icon: Box,
        // Calm blue/cyan gradient
        gradient: "from-cyan-500 to-blue-500"
    }
];

interface PresetSelectorProps {
    onSelect: (url: string) => void;
    onCancel: () => void;
}

export function PresetSelector({ onSelect, onCancel }: PresetSelectorProps) {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <Card className="w-full max-w-4xl shadow-2xl border-muted/40">
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl font-bold">Start with a template</CardTitle>
                    <CardDescription className="text-lg">
                        Choose a preset to jumpstart your project or start from scratch.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                        {PRESETS.map((preset) => (
                            <div
                                key={preset.url}
                                className="group relative cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl rounded-xl overflow-hidden border border-border/50 bg-card"
                                onClick={() => onSelect(preset.url)}
                            >
                                {/* Preview Area */}
                                <div className={`h-32 w-full bg-gradient-to-br ${preset.gradient} flex items-center justify-center`}>
                                    {/* <preset.icon className="h-12 w-12 text-white/90 drop-shadow-md group-hover:scale-110 transition-transform duration-300" /> */}
                                </div>

                                <div className="p-5">
                                    <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                                        {preset.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                                        {preset.description}
                                    </p>
                                    <Button variant="secondary" className="w-full cursor-pointer">
                                        Select Template
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-center pb-8">
                    <Button variant="ghost" size="lg" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
                        <CopyPlus className="mr-2 h-4 w-4" />
                        Start with Empty Project
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
