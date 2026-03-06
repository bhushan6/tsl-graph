'use client';

import { AlertCircle, Camera, Maximize2, Minimize2, Settings2 } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import type { PreviewMeshType } from '@/store/editor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DebouncedInput } from '@/components/DebouncedInput';
import type { PreviewControlsProps } from './types';

const meshOptions: { value: PreviewMeshType; name: string }[] = [
    { value: 'sphere', name: 'Sphere' },
    { value: 'box', name: 'Box' },
    { value: 'torus', name: 'Torus' },
    { value: 'plane', name: 'Plane' },
    { value: 'fullscreenQuad', name: 'Fullscreen Quad' },
    { value: 'cylinder', name: 'Cylinder' },
];

const hdriOptions = [
    { value: 'none', label: 'None' },
    { value: 'apartment', label: 'Apartment' },
    { value: 'bridge', label: 'Bridge' },
    { value: 'city', label: 'City' },
    { value: 'dawn', label: 'Dawn' },
    { value: 'esplanade', label: 'Esplanade' },
    { value: 'forest', label: 'Forest' },
    { value: 'hall', label: 'Hall' },
    { value: 'lab', label: 'Lab' },
    { value: 'lobby', label: 'Lobby' },
    { value: 'night', label: 'Night' },
    { value: 'park', label: 'Park' },
    { value: 'sky', label: 'Sky' },
    { value: 'studio', label: 'Studio' },
    { value: 'sunrise', label: 'Sunrise' },
    { value: 'sunset', label: 'Sunset' },
    { value: 'venice', label: 'Venice' },
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'workshop', label: 'Workshop' },
];

export function PreviewControls({
    isFullScreen,
    onToggleFullScreen,
    onDownloadSnapshot,
    isReady,
    allowPostProcessingToggle,
    previewSettings,
    updatePreviewSettings,
    updatePreviewSettingsDebounced,
    isGeometryScriptOpen,
    onGeometryScriptDialogOpenChange,
    geometryScriptDraft,
    onGeometryScriptDraftChange,
    onSaveGeometryScript,
    onCancelGeometryScript,
    materialError,
    postError,
    geometryScriptError,
}: PreviewControlsProps) {
    const { resolvedTheme } = useTheme();
    const isFullscreenQuad = previewSettings.mesh === 'fullscreenQuad';

    return (
        <>
            <Dialog open={isGeometryScriptOpen} onOpenChange={onGeometryScriptDialogOpenChange}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            Geometry Script
                        </DialogTitle>
                        <DialogDescription>
                            Runs automatically on the preview geometry. Available variables: <code className="text-xs">geometry</code>, <code className="text-xs">THREE</code>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 py-2">
                        <CodeMirror
                            value={geometryScriptDraft}
                            height="280px"
                            extensions={[javascript()]}
                            theme={resolvedTheme === 'dark' ? oneDark : undefined}
                            onChange={(value) => onGeometryScriptDraftChange(value)}
                        />
                        {geometryScriptError && (
                            <div className="flex items-center gap-2 text-xs text-destructive">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span>{geometryScriptError}</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={onCancelGeometryScript}>
                            Cancel
                        </Button>
                        <Button onClick={onSaveGeometryScript}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="absolute top-2 right-2 z-10 flex gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onToggleFullScreen}
                >
                    {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onDownloadSnapshot}
                    title="Take Snapshot"
                >
                    <Camera className="h-4 w-4" />
                </Button>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <h4 className="font-medium leading-none">Preview Settings</h4>
                                <p className="text-sm text-muted-foreground">
                                    Configure the preview geometry and instancing.
                                </p>
                            </div>

                            <div className="grid gap-4">
                                <div className="grid grid-cols-2 items-center gap-4">
                                    <Label>Geometry</Label>
                                    <select
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                                        value={previewSettings.mesh}
                                        onChange={(e) => updatePreviewSettings({ mesh: e.target.value as PreviewMeshType })}
                                    >
                                        {meshOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {!isFullscreenQuad && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Environment</Label>
                                            <select
                                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                                                value={previewSettings.environment || 'none'}
                                                onChange={(e) => updatePreviewSettingsDebounced({ environment: e.target.value })}
                                            >
                                                {hdriOptions.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {previewSettings.environment && previewSettings.environment !== 'none' && (
                                            <>
                                                <div className="grid grid-cols-2 items-center gap-4">
                                                    <Label>Intensity</Label>
                                                    <DebouncedInput
                                                        type="number"
                                                        step={0.1}
                                                        min={0}
                                                        max={5}
                                                        value={previewSettings.environmentIntensity ?? 1}
                                                        onChange={(value) => updatePreviewSettings({ environmentIntensity: Number(value) })}
                                                        className="h-8"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <Label>Show Background</Label>
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-primary"
                                                        checked={previewSettings.showEnvironmentBackground ?? false}
                                                        onChange={(e) => updatePreviewSettingsDebounced({ showEnvironmentBackground: e.target.checked })}
                                                    />
                                                </div>
                                            </>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <Label>Show Grid</Label>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-primary"
                                                checked={previewSettings.showGrid ?? true}
                                                onChange={(e) => updatePreviewSettingsDebounced({ showGrid: e.target.checked })}
                                            />
                                        </div>
                                    </>
                                )}

                                {allowPostProcessingToggle && (
                                    <div className="flex items-center justify-between">
                                        <Label>Enable Post-Processing</Label>
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-primary"
                                            checked={previewSettings.postEnabled ?? true}
                                            onChange={(e) => updatePreviewSettingsDebounced({ postEnabled: e.target.checked })}
                                        />
                                    </div>
                                )}

                                {previewSettings.mesh === 'box' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Size (W/H/D)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.width ?? 1.5}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, width: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.height ?? 1.5}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, height: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.depth ?? 1.5}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, depth: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.widthSegments ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, widthSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightSegments ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.depthSegments ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, depthSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {previewSettings.mesh === 'sphere' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Radius</Label>
                                            <DebouncedInput
                                                type="number"
                                                value={previewSettings.config?.radius ?? 1}
                                                onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radius: Number(value) } })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments (W/H)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.widthSegmentsSphere ?? 32}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, widthSegmentsSphere: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightSegmentsSphere ?? 16}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightSegmentsSphere: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {previewSettings.mesh === 'torus' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Radius</Label>
                                            <DebouncedInput
                                                type="number"
                                                value={previewSettings.config?.radiusTorus ?? 0.8}
                                                onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radiusTorus: Number(value) } })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Tube</Label>
                                            <DebouncedInput
                                                type="number"
                                                value={previewSettings.config?.tube ?? 0.3}
                                                onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, tube: Number(value) } })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments (T/R)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.tubularSegments ?? 32}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, tubularSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.radialSegments ?? 16}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radialSegments: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {previewSettings.mesh === 'plane' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Size (W/H)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.widthPlane ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, widthPlane: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightPlane ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightPlane: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments (W/H)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.widthSegmentsPlane ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, widthSegmentsPlane: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightSegmentsPlane ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightSegmentsPlane: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {previewSettings.mesh === 'cylinder' && (
                                    <>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Radius (Top/Bot)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.radiusTop ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radiusTop: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.radiusBottom ?? 1}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radiusBottom: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Height</Label>
                                            <DebouncedInput
                                                type="number"
                                                value={previewSettings.config?.heightCylinder ?? 1}
                                                onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightCylinder: Number(value) } })}
                                                className="h-8"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 items-center gap-4">
                                            <Label>Segments (R/H)</Label>
                                            <div className="flex gap-1">
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.radialSegmentsCylinder ?? 20}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, radialSegmentsCylinder: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                                <DebouncedInput
                                                    type="number"
                                                    value={previewSettings.config?.heightSegmentsCylinder ?? 20}
                                                    onChange={(value) => updatePreviewSettings({ config: { ...previewSettings.config, heightSegmentsCylinder: Number(value) } })}
                                                    className="h-8 px-2"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label>Open Ended</Label>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-primary"
                                                checked={previewSettings.config?.openEnded ?? true}
                                                onChange={(e) => updatePreviewSettings({ config: { ...previewSettings.config, openEnded: e.target.checked } })}
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="flex items-center justify-between">
                                    <Label>Geometry Script</Label>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onGeometryScriptDialogOpenChange(true)}
                                    >
                                        {previewSettings.geometryScript?.trim() ? 'Edit' : 'Add'}
                                    </Button>
                                </div>
                                {geometryScriptError && (
                                    <div className="flex items-center gap-2 text-xs text-destructive">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        <span>Geometry script error</span>
                                    </div>
                                )}

                                {!isFullscreenQuad && (
                                    <>
                                        <div className="h-[1px] bg-border my-1" />

                                        <div className="flex items-center justify-between">
                                            <Label>Show Backdrop</Label>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-primary"
                                                checked={previewSettings.showBackdrop ?? false}
                                                onChange={(e) => updatePreviewSettingsDebounced({ showBackdrop: e.target.checked })}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <Label>Instancing</Label>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-primary"
                                                checked={previewSettings.isInstanced}
                                                onChange={(e) => updatePreviewSettings({ isInstanced: e.target.checked })}
                                            />
                                        </div>
                                        {previewSettings.isInstanced && (
                                            <div className="grid grid-cols-2 items-center gap-4">
                                                <Label>Instance Count</Label>
                                                <Input
                                                    type="number"
                                                    value={previewSettings.instanceCount}
                                                    onChange={(e) => updatePreviewSettings({ instanceCount: Number(e.target.value) })}
                                                    className="h-8"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {(materialError || postError || geometryScriptError) && (
                <div className="absolute bottom-2 left-2 right-2 z-10 bg-destructive/80 text-destructive-foreground text-xs p-2 rounded space-y-1">
                    {materialError && <div>{materialError}</div>}
                    {postError && <div>Post: {postError}</div>}
                    {geometryScriptError && <div>Geometry Script: {geometryScriptError}</div>}
                </div>
            )}

            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-card">
                    <span className="text-xs text-muted-foreground">Initializing WebGPU...</span>
                </div>
            )}
        </>
    );
}
