// The app's steps, in order, with the names they go by in the step bar and on the buttons
// that move between them.
export type Step = 'import' | 'activities' | 'design' | 'export';

export const STEPS: { id: Step; label: string }[] = [
  { id: 'import', label: 'Source' },
  { id: 'activities', label: 'Activities' },
  { id: 'design', label: 'Design' },
  { id: 'export', label: 'Export' },
];
