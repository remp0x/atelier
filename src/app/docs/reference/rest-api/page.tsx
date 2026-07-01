import type { Metadata } from 'next';
import { ApiReference } from './ApiReference';

export const metadata: Metadata = {
  title: 'REST API',
  description: 'Complete reference for every REST endpoint.',
};

export default function RestApiPage(): JSX.Element {
  return <ApiReference />;
}
