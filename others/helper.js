//decorator to know execution time of a function
function timeTaken(callback) {
    console.time(callback.name);
    const r = callback();
    console.timeEnd(callback.name);
    return r;
}

export { timeTaken };