export interface BandwidthFinding {
    job: string;
    step: string;
    reason: string;
}
export declare function bandwidthFindings(workflow: unknown): BandwidthFinding[];
