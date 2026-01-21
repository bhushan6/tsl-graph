import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyPlus } from "lucide-react";
import Image from "next/image";

interface Preset {
    name: string;
    description: string;
    url: string;
    thumbnail: string;
}

const PRESETS: Preset[] = [
    {
        name: "Galaxy",
        description: "A swirling galaxy particle from three js journey",
        url: "/galaxy.json",
        thumbnail: "/galaxy.png"
    },
    {
        name: "Noise Gradient",
        description: "Smooth procedural noise based color gradients.",
        url: "/noise-gradient.json",
        thumbnail: "/noise-gradient.png"
    },
    {
        name: "SDF Circles",
        description: "SDF Circles pattern.",
        url: "/sdf-circles.json",
        thumbnail: "/sdf-circles.png"
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
                                className="group relative cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl rounded-xl overflow-hidden border border-border/50 bg-card flex flex-col"
                                onClick={() => onSelect(preset.url)}
                            >
                                {/* Preview Area */}
                                <div className={`h-32 w-full bg-gradient-to-br flex items-center justify-center`}>
                                    <Image src={preset.thumbnail} width={512} height={512} alt={preset.name} className="w-full h-full object-cover" />
                                </div>

                                <div className="p-5 flex flex-col flex-1">
                                    <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                                        {preset.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                                        {preset.description}
                                    </p>
                                    <Button variant="secondary" className="w-full cursor-pointer mt-auto">
                                        Select Template
                                    </Button>
                                </div>
                            </div>

                        ))}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-center pb-8">
                    <Button variant="ghost" size="lg" onClick={onCancel} className="text-muted-foreground hover:text-foreground cursor-pointer">
                        <CopyPlus className="mr-2 h-4 w-4" />
                        Start with Empty Project
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
