import type { ReactNode } from "react";

export interface MapProps {
  center?: [number, number];
  zoom?: number;
  viewport?: {
    center: [number, number];
    zoom: number;
    bearing?: number;
    pitch?: number;
  };
  onViewportChange?: (viewport: any) => void;
  styles?: { light?: string; dark?: string };
  children?: ReactNode;
  className?: string;
}

export interface MapRef {
  getMap: () => any;
  easeTo: (options: any) => void;
  flyTo: (options: any) => void;
}

export interface MapMarkerProps {
  position: [number, number];
  children?: ReactNode;
}

export interface MarkerContentProps {
  children?: ReactNode;
}

export interface MarkerPopupProps {
  children?: ReactNode;
}

export interface MarkerTooltipProps {
  children?: ReactNode;
}

export interface MarkerLabelProps {
  children?: ReactNode;
}

export interface MapPopupProps {
  position: [number, number];
  children?: ReactNode;
  onClose?: () => void;
}

export interface MapControlsProps {
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  showZoom?: boolean;
  showCompass?: boolean;
  showLocate?: boolean;
  showFullscreen?: boolean;
}

export interface MapRouteProps {
  coordinates: [number, number][];
  color?: string;
  width?: number;
}

export interface MapClusterLayerProps {
  data: any;
  onClusterClick?: (clusterId: number, coordinates: [number, number]) => void;
  onPointClick?: (feature: any) => void;
}

export const Map: React.ForwardRefExoticComponent<
  MapProps & React.RefAttributes<MapRef>
>;
export const MapMarker: React.FC<MapMarkerProps>;
export const MarkerContent: React.FC<MarkerContentProps>;
export const MarkerPopup: React.FC<MarkerPopupProps>;
export const MarkerTooltip: React.FC<MarkerTooltipProps>;
export const MarkerLabel: React.FC<MarkerLabelProps>;
export const MapPopup: React.FC<MapPopupProps>;
export const MapControls: React.FC<MapControlsProps>;
export const MapRoute: React.FC<MapRouteProps>;
export const MapClusterLayer: React.FC<MapClusterLayerProps>;
export function useMap(): { map: any; isLoaded: boolean };
