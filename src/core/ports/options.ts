/**
 * Options every port call accepts.
 *
 * @public
 */
export interface PdfCallOptions {
  /**
   * Cancels the call. It then rejects with a `PdfError` whose code is
   * `ABORTED`, `TIMEOUT`, or the code of an `SdkError` given as the abort
   * reason, such as `PROCESSING_TIME_EXCEEDED`.
   */
  readonly signal?: AbortSignal;
}

/**
 * Options for calls that take PDF bytes.
 *
 * @public
 */
export interface PdfTransferOptions extends PdfCallOptions {
  /**
   * Hand the bytes' buffers to the worker instead of copying them. The
   * caller's buffers are detached and must not be used afterwards. Defaults
   * to `false`, so a caller's bytes are never detached by surprise.
   */
  readonly transfer?: boolean;
}
