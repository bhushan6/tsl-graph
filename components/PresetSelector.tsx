import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, CopyPlus, Loader2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import Link from "next/link";

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
    onSelect: (url: string) => Promise<void> | void;
    onCancel: () => void;
}

export function PresetSelector({ onSelect, onCancel }: PresetSelectorProps) {
    const [loadingPreset, setLoadingPreset] = useState<string | null>(null);

    const handleSelect = async (url: string) => {
        if (loadingPreset) return;
        setLoadingPreset(url);
        try {
            await onSelect(url);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingPreset(null);
        }
    };

    const isProcessing = loadingPreset !== null;

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
                                className={`group relative transition-all rounded-xl overflow-hidden border border-border/50 bg-card flex flex-col ${isProcessing && loadingPreset !== preset.url ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:shadow-xl'
                                    }`}
                                onClick={() => !isProcessing && handleSelect(preset.url)}
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
                                    <Button
                                        variant="secondary"
                                        className="w-full mt-auto"
                                        disabled={isProcessing}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelect(preset.url);
                                        }}
                                    >
                                        {loadingPreset === preset.url ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Loading...
                                            </>
                                        ) : (
                                            "Select Template"
                                        )}
                                    </Button>
                                </div>
                            </div>

                        ))}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-center gap-4 pb-8">
                    <Link href="/editor/tutorial">
                        <Button
                            variant="outline"
                            size="lg"
                            className="font-medium"
                        >
                            <BookOpen className="mr-2 h-4 w-4" />
                            Open tutorial
                        </Button>
                    </Link>
                    <Button
                        variant="ghost"
                        size="lg"
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <CopyPlus className="mr-2 h-4 w-4" />
                        Start with Empty Project
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
