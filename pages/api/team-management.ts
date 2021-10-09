import type { NextApiRequest, NextApiResponse } from 'next';
import { customAlphabet } from 'nanoid';
import Team from '../../models/team';
import dbConnect from '../../middleware/database';
import { getSession } from 'next-auth/client';
import { TeamProfile } from '../team';
import User from '../../models/user';
import { ObjectId } from 'mongodb';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz', 7);

export default async function handler(req: NextApiRequest, res: NextApiResponse<TeamProfile | string>) {
	const session = await getSession({ req });
	if (session?.userType !== 'HACKER') return res.status(403).send('Forbidden');
	// TODO: add uniqueness validation try catch
	await dbConnect();
	const hacker = await User.findById(session.userID);
	switch (req.method) {
		case 'GET':
			const team = await Team.findOne({ members: session.userID })
				.populate({ path: 'members', model: User })
				.lean();
			return res.status(team ? 200 : 409).send(team);
		case 'POST': {
			const { joinCode, teamName, devpost } = req.body;
			// join team
			if (joinCode) {
				const team = await Team.findOne({ joinCode });
				if (!team) return res.status(404).send('Team not found');

				team.members.push(hacker);
				await team.save();
				return res.status(201).send(team);
			} else if (teamName) {
				// make team
				const teamObj = {
					name: teamName,
					joinCode: nanoid(),
					devpost,
					members: [hacker._id],
				};
				const team = new Team(teamObj);
				await team.save();
				return res.status(201).send(team);
			} else {
				return res.status(400).send('Either joinCode or teamName required.');
			}
		}
		case 'PATCH': {
			const team = await Team.findOne({ members: session.userID });
			if (!team) return res.status(404).send('Team not found');

			const { teamName, devpost } = req.body;
			if (devpost) team.devpost = devpost;
			if (teamName) team.name = teamName;

			await team.save();
			return res.status(200).send(team);
		}

		case 'DELETE': {
			const { userID } = session;
			let team = await Team.findOne({ members: session.userID });
			if (!team) return res.status(404).send('Team not found');
			team.members = team.members.filter((member: ObjectId) => member.toString() !== userID);
			if (!team.members.length) {
				await Team.deleteOne({ members: session.userID });
				return res.status(200).send(`Team ${team.name} deleted successfully.`);
			}
			await team.save();
			return res.status(200).send(team);
		}
		default:
			return res.status(405).send('Method not supported brother');
	}
}