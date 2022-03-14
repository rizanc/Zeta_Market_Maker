function toPrec(x: number, precision: number): number {
    return parseFloat(x.toFixed(precision));
}

function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
};

function printConvergedOrders(wantedOrders: any[], cancelOrders: any[], newOrders: any[]) {
    console.log("Wanted Orders");
    console.log(wantedOrders);
    console.log("Cancel Orders");
    console.log(cancelOrders);
    console.log("New Orders");
    console.log(newOrders);
}

export default {
    toPrec,
    sigmoid,
    printConvergedOrders
}