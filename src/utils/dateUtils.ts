/**
 * Calculate the difference in days between the current date and a given date
 * @param date - The date to calculate difference from
 * @returns The difference in days (positive if date is in the past, negative if in the future)
 */
export const calculateDateDifference = (date: Date | null | undefined): number | null => {
    if (!date) return null;
    
    const currentDate = new Date();
    const targetDate = new Date(date);
    
    // Reset time to midnight for accurate day calculation
    currentDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    
    const timeDifference = currentDate.getTime() - targetDate.getTime();
    const daysDifference = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
    
    return daysDifference;
  };
  
  /**
   * Calculate shared card diff date (difference between current date and shade card approval date)
   * @param shadeCardApprovalDate - The shade card approval date
   * @returns The difference in days
   */
  export const calculateSharedCardDiffDate = (shadeCardApprovalDate: Date | null | undefined): number | null => {
    return calculateDateDifference(shadeCardApprovalDate);
  };