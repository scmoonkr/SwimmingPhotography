// 예전에 S3(iDrive)로 올렸던 이미지 주소를 알아보기 위한 최소 헬퍼.
// 새 이미지는 files.js 가 서버 디스크(UPLOAD_DIR/erp)에 저장하며, S3 로는 더 이상 올리지 않는다.
const base = () => (process.env.CLOUD_PUBLIC_URL || '').replace(/\/+$/, '')

export function isOurImage(url) {
  const b = base()
  return !!b && String(url).startsWith(`${b}/erp/`)
}
