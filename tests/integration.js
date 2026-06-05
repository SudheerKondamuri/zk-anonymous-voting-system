const API_URL = 'http://localhost:8000';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log('=== Starting ZK Anonymous Voting Integration Test ===');

    // 1. Health check
    try {
        const res = await fetch(`${API_URL}/health`);
        const health = await res.json();
        console.log('API Health Check:', health);
    } catch (err) {
        console.error('API is not running. Make sure the server is active on port 6000.');
        process.exit(1);
    }

    // 2. Create Poll
    console.log('\nCreating a new poll...');
    const pollRes = await fetch(`${API_URL}/api/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: 'Is ZK-SNARK technology revolutionary?',
            options: ['No', 'Yes'], // index 0 = No, index 1 = Yes
            duration: 8 // 8 seconds duration so it expires quickly for testing
        })
    });
    const pollData = await pollRes.json();
    console.log('Poll Created:', pollData);
    const pollId = pollData.pollId;

    // 3. Register Voter 1
    console.log('\nRegistering Voter 1...');
    const voter1Res = await fetch(`${API_URL}/api/polls/${pollId}/register`, { method: 'POST' });
    const voter1Data = await voter1Res.json();
    console.log('Voter 1 Registered:', voter1Data);
    const commitment1 = voter1Data.commitment;

    // 4. Register Voter 2
    console.log('\nRegistering Voter 2...');
    const voter2Res = await fetch(`${API_URL}/api/polls/${pollId}/register`, { method: 'POST' });
    const voter2Data = await voter2Res.json();
    console.log('Voter 2 Registered:', voter2Data);
    const commitment2 = voter2Data.commitment;

    // 5. Cast Vote for Voter 1 (Choice = 1, YES)
    console.log('\nCasting Vote for Voter 1 (Choice: 1 - Yes)...');
    const vote1Res = await fetch(`${API_URL}/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            voterCommitment: commitment1,
            voteChoice: 1
        })
    });
    const vote1Data = await vote1Res.json();
    console.log('Vote 1 Cast response:', vote1Data);

    // 6. Cast Vote for Voter 2 (Choice: 0 - No)
    console.log('\nCasting Vote for Voter 2 (Choice: 0 - No)...');
    const vote2Res = await fetch(`${API_URL}/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            voterCommitment: commitment2,
            voteChoice: 0
        })
    });
    const vote2Data = await vote2Res.json();
    console.log('Vote 2 Cast response:', vote2Data);

    // 7. Verify Double Voting Fails
    console.log('\nAttempting to double-vote for Voter 1...');
    const doubleVoteRes = await fetch(`${API_URL}/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            voterCommitment: commitment1,
            voteChoice: 1
        })
    });
    console.log('Double voting response status:', doubleVoteRes.status);
    if (doubleVoteRes.status === 400) {
        const errorData = await doubleVoteRes.json();
        console.log('SUCCESS: Double voting failed as expected. Error:', errorData.error);
    } else {
        console.error('FAIL: Double voting succeeded or failed with unexpected status:', doubleVoteRes.status);
        process.exit(1);
    }

    // 8. Attempt to get results before expiration (should fail)
    console.log('\nAttempting to fetch results before poll expiration...');
    const resultsBeforeRes = await fetch(`${API_URL}/api/polls/${pollId}/results`);
    console.log('Results before expiration response status:', resultsBeforeRes.status);
    if (resultsBeforeRes.status === 400) {
        const errorData = await resultsBeforeRes.json();
        console.log('SUCCESS: Fetching results failed before expiration as expected. Error:', errorData.error);
    } else {
        console.error('FAIL: Fetching results succeeded before expiration or returned unexpected status:', resultsBeforeRes.status);
        process.exit(1);
    }

    // 9. Sleep to let the poll expire
    console.log('\nWaiting 10 seconds for the poll to expire...');
    await sleep(10000);

    // 10. Get Results
    console.log('\nFetching final poll results...');
    const resultsRes = await fetch(`${API_URL}/api/polls/${pollId}/results`);
    const resultsData = await resultsRes.json();
    console.log('Poll Results:', JSON.stringify(resultsData, null, 2));

    // Verify tally
    const results = resultsData.results;
    if (results['Yes'] === 1 && results['No'] === 1) {
        console.log('\nTALLY IS CORRECT! YES: 1, NO: 1');
        console.log('\n=== INTEGRATION TEST PASSED SUCCESSFULLY ===');
        process.exit(0);
    } else {
        console.error('\nFAIL: Tally is incorrect! Expected Yes: 1, No: 1. Got:', results);
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
