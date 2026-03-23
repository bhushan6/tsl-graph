import { cn } from "@/lib/utils";

interface LogoProps {
    className?: string;
    size?: "sm" | "md" | "lg" | "xl" | "xxxxl";
}

export function Logo({ className, size = "md" }: LogoProps) {
    const sizeClasses = {
        sm: {
            container: "",
            tsl: "text-sm",
            graph: "text-[8px] tracking-widest",
        },
        md: {
            container: "",
            tsl: "text-lg",
            graph: "text-[10px] tracking-[0.2em]",
        },
        lg: {
            container: "",
            tsl: "text-2xl",
            graph: "text-xs tracking-[0.25em]",
        },
        xl: {
            container: "",
            tsl: "text-4xl",
            graph: "text-sm tracking-[0.3em]",
        },
        xxxxl: {
            container: "",
            tsl: "text-8xl",
            graph: "text-4xl tracking-[0.4em]",
        }
    };

    const { tsl, graph } = sizeClasses[size];

    return (
        <div className={cn("flex flex-col items-center justify-center leading-none select-none", className)}>
            <span className={cn("font-black text-foreground tracking-tighter", tsl)}>
                TSL
            </span>
            <span style={{
                textBox: "trim-both text"
            }} className={cn("font-bold text-muted-foreground", graph)}>
                GRAPH
            </span>
        </div>
    );
}
