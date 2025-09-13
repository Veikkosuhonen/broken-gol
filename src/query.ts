export const createTimestampQueries = ({
  device,
  count = 1,
}: {
  device: GPUDevice;
  count?: number;
}) => {
  const querySet = device.createQuerySet({
    type: "timestamp",
    count: count * 2, // 1 for start and 1 for end
  });

  const queryResolveBuffer = device.createBuffer({
    size: querySet.count * 8, // each timestamp is 8 bytes
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });

  const queryResultBuffer = device.createBuffer({
    size: queryResolveBuffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const getTimestampWrites = (idx: number): GPURenderPassTimestampWrites => ({
    querySet,
    beginningOfPassWriteIndex: idx * 2,
    endOfPassWriteIndex: idx * 2 + 1,
  });

  const timeStampWrites: GPURenderPassTimestampWrites[] = [];
  const gpuTimes: number[] = [];

  for (let i = 0; i < count; i++) {
    timeStampWrites.push(getTimestampWrites(i));
    gpuTimes.push(0);
  }

  const isUnmapped = () => queryResultBuffer.mapState === "unmapped";

  const resolve = (encoder: GPUCommandEncoder) => {
    encoder.resolveQuerySet(querySet, 0, querySet.count, queryResolveBuffer, 0);
    if (isUnmapped()) {
      encoder.copyBufferToBuffer(
        queryResolveBuffer,
        0,
        queryResultBuffer,
        0,
        queryResolveBuffer.size,
      );
    }
  };

  const read = async () => {
    if (isUnmapped()) {
      await queryResultBuffer.mapAsync(GPUMapMode.READ);
      const arrayBuffer = queryResultBuffer.getMappedRange();
      const data = new BigInt64Array(arrayBuffer);
      for (let i = 0; i < count; i++) {
        const start = data[i * 2];
        const end = data[i * 2 + 1];
        gpuTimes[i] = Number(end - start) / 1e6;
      }
      queryResultBuffer.unmap();
    }
    return gpuTimes;
  };

  return {
    timeStampWrites,
    resolve,
    read,
  };
};
