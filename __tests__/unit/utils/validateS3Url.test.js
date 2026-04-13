const { isValidS3Reference } = require('../../../utils/validateS3Url');

const BUCKET = 'ecommerce-website-media';
const REGION = 'eu-west-3';
const ORDER_ID = 'order-123';
const PREFIX = `refund-proofs/${ORDER_ID}/`;

const virtual = (key) =>
  `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
const pathStyle = (key) =>
  `https://s3.${REGION}.amazonaws.com/${BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;

describe('isValidS3Reference', () => {
  const opts = { expectedPrefix: PREFIX, expectedBucket: BUCKET, expectedRegion: REGION };

  it('accepts a bare key matching the prefix', () => {
    expect(isValidS3Reference(`${PREFIX}photo.jpg`, opts)).toBe(true);
  });

  it('accepts a virtual-hosted URL', () => {
    expect(isValidS3Reference(virtual(`${PREFIX}photo.jpg`), opts)).toBe(true);
  });

  it('accepts a path-style URL', () => {
    expect(isValidS3Reference(pathStyle(`${PREFIX}photo.jpg`), opts)).toBe(true);
  });

  it('rejects wrong order prefix', () => {
    expect(isValidS3Reference(virtual('refund-proofs/other/x.jpg'), opts)).toBe(false);
  });

  it('rejects wrong bucket (virtual host)', () => {
    const badUrl = `https://attacker.s3.${REGION}.amazonaws.com/${PREFIX}x.jpg`;
    expect(isValidS3Reference(badUrl, opts)).toBe(false);
  });

  it('rejects wrong region', () => {
    const badUrl = `https://${BUCKET}.s3.us-east-1.amazonaws.com/${PREFIX}x.jpg`;
    expect(isValidS3Reference(badUrl, opts)).toBe(false);
  });

  it('rejects non-S3 host', () => {
    expect(isValidS3Reference(`https://evil.com/${PREFIX}x.jpg`, opts)).toBe(false);
  });

  it('rejects http (non-https) URL', () => {
    expect(isValidS3Reference(virtual(`${PREFIX}x.jpg`).replace('https://', 'http://'), opts)).toBe(false);
  });

  it('rejects path traversal', () => {
    expect(isValidS3Reference(`${PREFIX}../products/evil.jpg`, opts)).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidS3Reference(null, opts)).toBe(false);
    expect(isValidS3Reference(42, opts)).toBe(false);
    expect(isValidS3Reference(undefined, opts)).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isValidS3Reference('https://', opts)).toBe(false);
    expect(isValidS3Reference('not a url', opts)).toBe(false);
  });

  it('rejects when expectedBucket is missing', () => {
    expect(isValidS3Reference(`${PREFIX}x.jpg`, { expectedPrefix: PREFIX })).toBe(false);
  });
});
