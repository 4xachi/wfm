import type { Metadata } from 'next';
import { TechMobileCockpit } from '@/components/tech/TechMobileCockpit';

export const metadata: Metadata = {
  title: 'Field Technician Mobile Cockpit — FiberBlaze Cavite WFM',
  description:
    'Cavite FTTH field technician mobile PWA with 3D street navigation, NAP port matrix, GPON optical dBm validation, camera-only watermarked evidence, signature capture, and IndexedDB dead-zone sync.',
};

export default function TechMobilePage() {
  return <TechMobileCockpit />;
}
