"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DemoEditor() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isReady, setIsReady] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const onFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            // Only the embedded same-origin editor may drive the demo (not, e.g., its preview sandbox).
            if (event.source !== iframeRef.current?.contentWindow || event.origin !== window.location.origin) return;
            const data = event.data;
            if (data && data.source === 'tsl-graph-editor') {
                if (data.type === 'tsl:event:ready') {
                    setIsReady(true);
                    try {
                        let graphDataToLoad = null;
                        const saved = localStorage.getItem('tsl-demo-graph');
                        if (saved) {
                            try {
                                graphDataToLoad = JSON.parse(saved);
                            } catch (e) {
                                console.error('Failed to parse local storage', e);
                            }
                        }

                        if (!graphDataToLoad) {
                            graphDataToLoad = {
                                "version": 2,
                                "activeRootGraph": "material",
                                "nodes": [
                                    {
                                        "id": "material/standard-1774115933971",
                                        "type": "material/standard",
                                        "position": {
                                            "x": 708.9212177083141,
                                            "y": 255.55650640318572
                                        },
                                        "selected": false,
                                        "data": {
                                            "type": "material/standard",
                                            "values": {
                                                "colorNode": "#ffffff",
                                                "roughnessNode": 0.5,
                                                "metalnessNode": 0,
                                                "emissiveNode": "#000000",
                                                "aoNode": 1,
                                                "opacityNode": 1,
                                                "side": 0,
                                                "transparent": false,
                                                "depthWrite": true
                                            },
                                            "connected": {}
                                        },
                                        "measured": {
                                            "width": 182,
                                            "height": 98
                                        },
                                        "dragging": false
                                    },
                                    {
                                        "id": "geo/normalLocal-1774115939957",
                                        "type": "geo/normalLocal",
                                        "position": {
                                            "x": 361.42400044121194,
                                            "y": 244.25753852941716
                                        },
                                        "selected": false,
                                        "data": {
                                            "type": "geo/normalLocal",
                                            "values": {},
                                            "connected": {}
                                        },
                                        "measured": {
                                            "width": 118,
                                            "height": 142
                                        },
                                        "dragging": false
                                    },
                                    {
                                        "id": "utils/linearGradient-1774115946917",
                                        "type": "utils/linearGradient",
                                        "position": {
                                            "x": 532.7486412009945,
                                            "y": 277.0643846323543
                                        },
                                        "selected": false,
                                        "data": {
                                            "type": "utils/linearGradient",
                                            "values": {
                                                "mode": 0,
                                                "stops": [
                                                    {
                                                        "id": "stop_0",
                                                        "color": "#2A7B9B",
                                                        "pos": 0
                                                    },
                                                    {
                                                        "id": "stop_1",
                                                        "color": "#57C785",
                                                        "pos": 0.5
                                                    },
                                                    {
                                                        "id": "stop_2",
                                                        "color": "#EDDD53",
                                                        "pos": 1
                                                    }
                                                ]
                                            },
                                            "connected": {}
                                        },
                                        "measured": {
                                            "width": 132,
                                            "height": 92
                                        },
                                        "dragging": false
                                    }
                                ],
                                "edges": [
                                    {
                                        "id": "edge-geo/normalLocal-1774115939957-y-utils/linearGradient-1774115946917-t",
                                        "source": "geo/normalLocal-1774115939957",
                                        "sourceHandle": "y",
                                        "target": "utils/linearGradient-1774115946917",
                                        "targetHandle": "t"
                                    },
                                    {
                                        "source": "utils/linearGradient-1774115946917",
                                        "sourceHandle": "out",
                                        "target": "material/standard-1774115933971",
                                        "targetHandle": "colorNode",
                                        "id": "xy-edge__utils/linearGradient-1774115946917out-material/standard-1774115933971colorNode"
                                    }
                                ],
                                "postNodes": [
                                    {
                                        "id": "post-input",
                                        "type": "post/input",
                                        "position": {
                                            "x": -400,
                                            "y": 200
                                        },
                                        "data": {
                                            "type": "post/input",
                                            "values": {},
                                            "connected": {}
                                        }
                                    },
                                    {
                                        "id": "post-output",
                                        "type": "post/output",
                                        "position": {
                                            "x": 400,
                                            "y": 200
                                        },
                                        "data": {
                                            "type": "post/output",
                                            "values": {},
                                            "connected": {}
                                        }
                                    }
                                ],
                                "postEdges": [],
                                "globals": [],
                                "subgraphs": {},
                                "codeNodes": {},
                                "previewSettings": {
                                    "mesh": "sphere",
                                    "isInstanced": false,
                                    "instanceCount": 100,
                                    "geometryScript": "",
                                    "codeMode": "generated",
                                    "customCode": "",
                                    "environment": "none",
                                    "environmentIntensity": 1,
                                    "showEnvironmentBackground": false,
                                    "showBackdrop": false,
                                    "showGrid": true,
                                    "postEnabled": false,
                                    "config": {
                                        "width": 1.5,
                                        "height": 1.5,
                                        "depth": 1.5,
                                        "widthSegments": 1,
                                        "heightSegments": 1,
                                        "depthSegments": 1,
                                        "radius": 1,
                                        "widthSegmentsSphere": 32,
                                        "heightSegmentsSphere": 16,
                                        "radiusTorus": 0.8,
                                        "tube": 0.3,
                                        "radialSegments": 16,
                                        "tubularSegments": 32,
                                        "widthPlane": 1,
                                        "heightPlane": 1,
                                        "widthSegmentsPlane": 1,
                                        "heightSegmentsPlane": 1,
                                        "radiusTop": 1,
                                        "radiusBottom": 1,
                                        "heightCylinder": 1,
                                        "radialSegmentsCylinder": 20,
                                        "heightSegmentsCylinder": 20,
                                        "openEnded": true
                                    }
                                }
                            };
                        }

                        iframeRef.current?.contentWindow?.postMessage({
                            source: "tsl-graph-host",
                            type: "tsl:command:load",
                            requestId: "load-landing-page",
                            payload: { graphData: graphDataToLoad }
                        }, window.location.origin);

                    } catch (err) {
                        console.error("Failed to load landing page shader", err);
                    }
                } else if (data.type === 'tsl:event:graph-changed') {
                    // pull graph data to save it
                    iframeRef.current?.contentWindow?.postMessage({
                        source: "tsl-graph-host",
                        type: "tsl:command:get-graph",
                        requestId: "save-demo-graph"
                    }, window.location.origin);
                } else if (data.type === 'tsl:response:get-graph' && data.requestId === 'save-demo-graph') {
                    const savedGraphData = data.payload?.graphData || data.graphData;
                    if (savedGraphData) {
                        try {
                            localStorage.setItem('tsl-demo-graph', JSON.stringify(savedGraphData));
                        } catch (err) {
                            console.error('Failed to save to local storage', err);
                        }
                    }
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);
    return (
        <div ref={containerRef} className="relative w-full h-full bg-white dark:bg-[#0A0A0A]">
            {!isReady && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white dark:bg-[#0A0A0A]">
                    <Loader2 className="h-8 w-8 animate-spin text-[#201D1D] dark:text-[#EAEAEA] mb-4" />
                    <p className="text-sm text-[#9A9898] dark:text-[#A1A1AA] font-mono animate-pulse">Initializing Editor...</p>
                </div>
            )}
            {isReady && (
                <div className="absolute bottom-0 right-0 z-20">
                    <Button
                        variant="secondary"
                        size="icon"
                        className="bg-black/80 dark:bg-white/80 backdrop-blur-sm border border-[#201D1D]/10 dark:border-[#EAEAEA]/10 text-white dark:text-black hover:bg-black/70 dark:hover:bg-white/70 cursor-pointer"
                        onClick={toggleFullscreen}
                        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    >
                        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </Button>
                </div>
            )}
            <iframe
                ref={iframeRef}
                src="/editor/standalone?docId=landing-demo"
                className="w-full h-full border-none transition-opacity duration-500"
                style={{ opacity: isReady ? 1 : 0 }}
                title="TSL Graph Standalone Editor"
            />
        </div>
    );
}
