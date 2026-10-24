function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("kazi-demo-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("File storage is unavailable in this browser."));
  });
}
export async function storeDemoFile(id: string, file: Blob) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readDemoFile(id: string) {
  const db = await database();
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(id);
      request.onsuccess = () =>
        request.result
          ? resolve(request.result)
          : reject(
              new Error(
                "This demo file is no longer available in this browser.",
              ),
            );
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function clearDemoFiles() {
  const db = await database();
  try {
    db.transaction("files", "readwrite").objectStore("files").clear();
  } finally {
    db.close();
  }
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
