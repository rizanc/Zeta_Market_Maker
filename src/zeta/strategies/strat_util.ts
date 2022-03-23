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

class RunningJobs {

    private runningJobs = { };

    private static getJobFormat(job: string, marketIndex: number) {
        return job + "_" + marketIndex;
    }

    isStarted(job: string, marketIndex: number) {
        if (this.runningJobs[
            RunningJobs.getJobFormat(job, marketIndex)]) {
            return true;
        } else {
            return false;
        }
    }

    start(job: string, marketIndex: number) {
        if (this.isStarted(job, marketIndex)) {
            throw Error("Job is already running");
        }

        this.runningJobs[
            RunningJobs.getJobFormat(job, marketIndex)] = true;
    }

    done(job: string, marketIndex: number) {

        if (!this.isStarted(job, marketIndex)) {
            throw Error("Job is not running");
        }

        delete this.runningJobs[
            RunningJobs.getJobFormat(job, marketIndex)];
    }

}

export default {
    toPrec,
    sigmoid,
    printConvergedOrders,
    RunningJobs
}