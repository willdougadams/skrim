import { useState, useRef } from 'react';

interface CameraState {
    x: number;
    y: number;
    scale: number;
}

interface UseGameCameraProps {
    initialScale?: number;
    initialX?: number;
    initialY?: number;
}

export const useGameCamera = ({
    initialScale = 1,
    initialX = 0,
    initialY = 0
}: UseGameCameraProps = {}) => {
    const [camera, setCamera] = useState<CameraState>({
        x: initialX,
        y: initialY,
        scale: initialScale
    });

    const containerRef = useRef<HTMLDivElement>(null);

    return {
        camera,
        setCamera,
        containerRef,
    };
};
