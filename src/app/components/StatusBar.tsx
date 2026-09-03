import { useEditor } from '../store/editor.js';

export function StatusBar(): React.JSX.Element {
  const status = useEditor((s) => s.status);
  return <span>{status}</span>;
}
