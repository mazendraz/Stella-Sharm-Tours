export async function resizeImage(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)
  )
    return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(Error('Image conversion failed')),
        type,
        0.9,
      ),
    );
    return new File(
      [blob],
      file.name.replace(/\.[^.]+$/, '') +
        (type === 'image/png' ? '.png' : '.jpg'),
      { type },
    );
  } finally {
    bitmap.close();
  }
}
export async function uploadFile(
  apiOrigin: string,
  csrf: string,
  file: File,
  onProgress: (value: number) => void,
) {
  return new Promise<{ id: string; status: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest(),
      data = new FormData();
    data.append('file', file);
    xhr.open('POST', apiOrigin + '/v1/admin/media');
    xhr.withCredentials = true;
    xhr.timeout = 600000;
    xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(Error('Upload failed'));
    xhr.ontimeout = () => reject(Error('Upload timed out'));
    xhr.onload = () => {
      try {
        if (xhr.status !== 202) throw Error('Upload rejected');
        resolve(JSON.parse(xhr.responseText));
      } catch (error) {
        reject(error);
      }
    };
    xhr.send(data);
  });
}
