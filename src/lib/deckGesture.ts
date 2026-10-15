import { createContext } from 'react';
import type { SurfaceGesture } from './gestureSurface';

/** Photo edges hand the same normalized gesture to the deck, without redispatch. */
export const DeckGestureContext = createContext<(gesture: SurfaceGesture) => boolean>(() => false);
