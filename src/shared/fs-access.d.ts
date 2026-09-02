// Minimal ambient declarations for the File System Access API surface this
// project uses; not yet in TypeScript's DOM lib.
interface Window {
  showDirectoryPicker(options?: {
    mode?: 'read' | 'readwrite';
    id?: string;
    startIn?: FileSystemHandle;
  }): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}
